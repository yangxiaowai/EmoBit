"""
语音克隆服务端 - 使用 IndexTTS2
支持零样本语音克隆，支持情感控制与多语言（中/英等）

IndexTTS2: https://github.com/index-tts/index-tts

使用方法:
1. 克隆并配置 IndexTTS2: 参见 docs/voice-clone-installation.md
2. 在 index-tts 项目根目录下运行本脚本 (或设置 INDEX_TTS_HOME)
3. WebSocket 端点: ws://localhost:10097

功能:
- 零样本语音克隆（无需训练）
- 中文 / 英文等多语言合成
- 可选情感控制（emo_audio_prompt / use_emo_text）
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import sys
import tempfile
from collections import OrderedDict
from pathlib import Path
from typing import Optional

# 合成结果缓存 (key: sha256(text|voice_id), value: wav_bytes)，避免重复短语重复推理
TTS_CACHE_MAX = int(os.environ.get("VOICE_CLONE_CACHE_SIZE", "50"))
_tts_cache: OrderedDict[str, bytes] = OrderedDict()

try:
    import websockets
except ImportError:
    print("请安装 websockets: pip install websockets  或在 index-tts 中: uv add websockets")
    sys.exit(1)

# 若设置 INDEX_TTS_HOME，则切换工作目录到 IndexTTS2 项目根
INDEX_TTS_HOME = os.environ.get("INDEX_TTS_HOME")
if INDEX_TTS_HOME:
    abs_home = os.path.abspath(INDEX_TTS_HOME)
    if os.path.isdir(abs_home):
        os.chdir(abs_home)
        sys.path.insert(0, abs_home)

# 使用绝对路径作为 HF 缓存，避免 Hub 将相对路径误当作 repo_id
_cwd = Path(os.getcwd())
if INDEX_TTS_HOME and os.path.isdir(os.path.abspath(INDEX_TTS_HOME)):
    _cwd = Path(os.path.abspath(INDEX_TTS_HOME))
_hf_cache = (_cwd / "checkpoints" / "hf_cache").resolve()
os.environ["HF_HUB_CACHE"] = str(_hf_cache)

try:
    import torch
except ImportError:
    torch = None

try:
    from indextts.infer_v2 import IndexTTS2
except ImportError as e:
    print(
        "无法导入 IndexTTS2。请确保:\n"
        "  1. 已克隆 index-tts 并完成 uv sync / 模型下载\n"
        "  2. 在 index-tts 根目录运行本脚本，或设置环境变量 INDEX_TTS_HOME 指向 index-tts 根目录\n"
        f"  ImportError: {e}"
    )
    sys.exit(1)

# infer_v2 导入时会覆盖 HF_HUB_CACHE，这里再次设为绝对路径
os.environ["HF_HUB_CACHE"] = str(_hf_cache)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# 禁用 websockets 库的默认日志（避免干扰）
logging.getLogger("websockets").setLevel(logging.WARNING)

# 模型与配置路径
_ROOT = Path(os.getcwd())
if INDEX_TTS_HOME and os.path.isdir(os.path.abspath(INDEX_TTS_HOME)):
    _ROOT = Path(os.path.abspath(INDEX_TTS_HOME))
CHECKPOINTS_DIR = (_ROOT / "checkpoints").resolve()

# ModelScope 布局：模型在 checkpoints/IndexTTS-2/（含 gpt.pth、qwen0.6bemo4-merge 等）
# 若存在则优先使用，否则用 checkpoints/ + config.yaml
INDEX_TTS2_SUBDIR = CHECKPOINTS_DIR / "IndexTTS-2"
if INDEX_TTS2_SUBDIR.is_dir() and (INDEX_TTS2_SUBDIR / "gpt.pth").exists():
    CONFIG_PATH = (INDEX_TTS2_SUBDIR / "config.yaml").resolve()
    MODEL_DIR = str(INDEX_TTS2_SUBDIR.resolve())
    logger.info("使用 ModelScope 布局: model_dir=%s", MODEL_DIR)
else:
    CONFIG_PATH = (CHECKPOINTS_DIR / "config.yaml").resolve()
    MODEL_DIR = str(CHECKPOINTS_DIR)

VOICES_DIR = Path(__file__).resolve().parent / "cloned_voices"
VOICES_DIR.mkdir(parents=True, exist_ok=True)

# 全局模型实例
tts_model: Optional[IndexTTS2] = None
_model_ready = False  # 模型是否已加载完成
_active_user_requests = 0  # 当前活跃的用户请求数（用于优先级控制）
# 模型推理锁：确保同一时间只有一个推理请求在执行（IndexTTS2 不是线程安全的）
_inference_lock: Optional[asyncio.Lock] = None

# 常用句列表（与服务端预生成一致）
COMMON_PHRASES = [
    "你好，我是你的数字人助手",
    "今天天气不错，24度晴朗。出门记得戴帽子防晒哦~",
    "好的，我来帮您导航。",
    "好的，我来帮您看看药。",
    "好的，让我们一起看看老照片吧~",
    "不客气，能帮到您是我的荣幸！",
    "抱歉，我没太听清楚，您能再说一遍吗？",
]


def initialize_model(
    use_fp16: bool = True,
    use_cuda_kernel: bool = False,
    use_deepspeed: bool = False,
    use_torch_compile: Optional[bool] = None,
) -> IndexTTS2:
    """初始化 IndexTTS2 模型"""
    global tts_model, _model_ready
    if tts_model is not None:
        return tts_model

    cfg = str(CONFIG_PATH)
    model_dir = MODEL_DIR
    if not os.path.isfile(cfg) or not os.path.isdir(model_dir):
        raise FileNotFoundError(
            f"未找到 IndexTTS2 配置或模型目录: config={cfg}, model_dir={model_dir}. "
            "请先在 index-tts 中下载模型到 checkpoints/ 或 checkpoints/IndexTTS-2/。"
        )

    if use_torch_compile is None:
        use_torch_compile = os.environ.get("VOICE_CLONE_USE_TORCH_COMPILE", "").lower() in ("1", "true", "yes")
    
    # 检查设备：MPS 上 torch.compile 可能与 einops 不兼容，自动禁用
    if use_torch_compile and torch is not None:
        if getattr(getattr(torch, "backends", None), "mps", None) and torch.backends.mps.is_available():
            logger.warning("MPS 设备上 torch.compile 可能与 einops 不兼容，已自动禁用（MPS 本身已足够快）")
            use_torch_compile = False
    
    if use_torch_compile:
        logger.info("启用 torch.compile 优化（首次推理会较慢，后续可加速）")

    logger.info("正在加载 IndexTTS2 模型... (config=%s, model_dir=%s)", cfg, model_dir)
    tts_model = IndexTTS2(
        cfg_path=cfg,
        model_dir=model_dir,
        use_fp16=use_fp16,
        use_cuda_kernel=use_cuda_kernel,
        use_deepspeed=use_deepspeed,
        use_torch_compile=use_torch_compile or False,
    )
    logger.info("IndexTTS2 模型加载完成。")
    _model_ready = True
    return tts_model


def get_registered_voice_ids() -> list[str]:
    """获取所有已注册的克隆音色 ID 列表"""
    voice_ids = []
    for meta_file in VOICES_DIR.glob("*.json"):
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
                voice_id = meta.get("voice_id")
                if voice_id and (VOICES_DIR / f"{voice_id}.wav").exists():
                    voice_ids.append(voice_id)
        except Exception as e:
            logger.debug("读取音色元数据失败 %s: %s", meta_file, e)
    return voice_ids


async def auto_preload_common_phrases():
    """模型加载完成后，自动为已注册的克隆音色预生成常用句（后台异步，低优先级，不阻塞用户请求）"""
    global _active_user_requests
    
    if not _model_ready or tts_model is None:
        return
    
    voice_ids = get_registered_voice_ids()
    if not voice_ids:
        logger.info("[预加载] 暂无已注册的克隆音色，跳过自动预加载")
        return
    
    # 只预加载第一个音色（通常是当前使用的），避免资源竞争
    # 其他音色在前端需要时会自动触发预加载
    target_voice_id = voice_ids[0]
    logger.info("[预加载] 开始为音色 %s 预生成常用句（后台低优先级，不阻塞用户请求）", target_voice_id)
    
    voice_path = VOICES_DIR / f"{target_voice_id}.wav"
    if not voice_path.exists():
        logger.warning("[预加载] 音色文件不存在: %s", voice_path)
        return
    
    # 使用信号量限制并发：最多同时处理 1 个预加载任务，让用户请求优先
    import asyncio
    semaphore = asyncio.Semaphore(1)  # 最多 1 个并发，避免占用过多资源
    
    async def preload_one_phrase(text: str):
        """预生成单个短语（带并发限制和用户请求检测）"""
        async with semaphore:
            try:
                # 如果有用户请求，等待更长时间，让用户请求优先
                if _active_user_requests > 0:
                    await asyncio.sleep(1.0)  # 用户请求活跃时，等待更久
                else:
                    await asyncio.sleep(0.1)  # 无用户请求时，正常延迟
                
                # 再次检查：如果用户请求来了，跳过本次预加载
                if _active_user_requests > 0:
                    logger.debug("[预加载] 检测到用户请求，跳过本次预加载")
                    return False
                
                await clone_and_synthesize(text, voice_path, voice_id=target_voice_id)
                logger.debug("[预加载] %s: %s... 完成", target_voice_id, text[:20])
                return True
            except Exception as e:
                logger.debug("[预加载] %s: %s... 失败: %s", target_voice_id, text[:20], e)
                return False
    
    # 逐个预加载常用句（低优先级，不阻塞）
    success_count = 0
    for text in COMMON_PHRASES:
        try:
            # 如果有用户请求，暂停预加载
            if _active_user_requests > 0:
                logger.debug("[预加载] 检测到用户请求，暂停预加载")
                await asyncio.sleep(2.0)  # 等待用户请求完成
                continue
            
            if await preload_one_phrase(text):
                success_count += 1
            # 每个短语之间稍作延迟，让用户请求有机会执行
            await asyncio.sleep(0.3)
        except Exception as e:
            logger.debug("[预加载] 预加载短语失败: %s", e)
    
    logger.info("[预加载] 完成：%d/%d 个短语预加载成功（音色: %s）", success_count, len(COMMON_PHRASES), target_voice_id)


def save_voice_sample(audio_base64: str, voice_id: str) -> Path:
    """将 Base64 音频保存为 WAV 文件"""
    raw = base64.b64decode(audio_base64)
    path = VOICES_DIR / f"{voice_id}.wav"
    path.write_bytes(raw)
    logger.info("声音样本已保存: %s", path)
    return path


def _synthesize_sync(
    text: str,
    voice_sample_path: Path,
    output_path: Path,
    emo_alpha: float = 1.0,
    use_emo_text: bool = False,
) -> Path:
    """同步调用 IndexTTS2 推理，写入 output_path，返回输出路径"""
    model = initialize_model()
    model.infer(
        spk_audio_prompt=str(voice_sample_path),
        text=text,
        output_path=str(output_path),
        emo_alpha=emo_alpha,
        use_emo_text=use_emo_text,
        verbose=False,
    )
    return output_path


def _cache_key(text: str, voice_id: str) -> str:
    return hashlib.sha256(f"{text}|{voice_id}".encode("utf-8")).hexdigest()


async def clone_and_synthesize(
    text: str,
    voice_sample_path: Path,
    *,
    voice_id: Optional[str] = None,
    emo_alpha: float = 1.0,
    use_emo_text: bool = False,
) -> bytes:
    """使用克隆音色合成语音，返回 WAV 字节。若提供 voice_id 则参与缓存。"""
    global _inference_lock
    
    key_id = voice_id if voice_id else str(voice_sample_path)
    ck = _cache_key(text, key_id) if key_id else None
    if ck and ck in _tts_cache:
        logger.info("[合成] 缓存命中: text=%s..., voice_id=%s", text[:30], key_id)
        _tts_cache.move_to_end(ck)
        return _tts_cache[ck]

    # 初始化锁（如果还没有）
    if _inference_lock is None:
        _inference_lock = asyncio.Lock()
    
    # 使用锁保护模型推理，确保串行执行（IndexTTS2 不是线程安全的）
    async with _inference_lock:
        loop = asyncio.get_running_loop()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            out_path = Path(f.name)
        try:
            await loop.run_in_executor(
                None,
                lambda: _synthesize_sync(
                    text,
                    voice_sample_path,
                    out_path,
                    emo_alpha=emo_alpha,
                    use_emo_text=use_emo_text,
                ),
            )
            wav_bytes = out_path.read_bytes()
            if ck and TTS_CACHE_MAX > 0:
                while len(_tts_cache) >= TTS_CACHE_MAX and _tts_cache:
                    _tts_cache.popitem(last=False)
                _tts_cache[ck] = wav_bytes
                _tts_cache.move_to_end(ck)
            return wav_bytes
        finally:
            try:
                out_path.unlink(missing_ok=True)
            except Exception:
                pass


async def handle_client(websocket, path=None):
    """处理 WebSocket 请求"""
    global _active_user_requests
    
    addr = getattr(websocket, "remote_address", None) or "unknown"
    logger.info("[连接] 新连接: %s", addr)
    logger.info("[连接] 等待消息...")

    try:
        logger.info("[连接] 进入消息循环，等待接收...")
        async for raw in websocket:
            try:
                raw_len = len(raw) if isinstance(raw, (str, bytes)) else 0
                logger.info("[请求] 收到消息, 长度=%s", raw_len)
                if raw_len > 500:
                    logger.info("[请求] (大概率含 base64 音频)")
                logger.debug("[请求] 原始消息前100字符: %s", str(raw)[:100] if isinstance(raw, str) else raw[:100] if isinstance(raw, bytes) else "N/A")
                data = json.loads(raw)
                action = data.get("action")
                language = data.get("language", "zh")  # 保留兼容，IndexTTS2 多语言自动处理
                logger.info("[请求] action=%s, 完整 keys=%s", action, list(data.keys()))

                if action == "clone_and_speak":
                    _active_user_requests += 1
                    try:
                        text = data.get("text", "").strip()
                        voice_b64 = data.get("voice_sample", "")
                        voice_id = data.get("voice_id", "default")
                        emo_alpha = float(data.get("emo_alpha", 1.0))
                        use_emo_text = bool(data.get("use_emo_text", False))

                        if not text:
                            await websocket.send(json.dumps({"error": "文本不能为空"}))
                            continue
                        if not voice_b64:
                            await websocket.send(json.dumps({"error": "声音样本不能为空"}))
                            continue

                        logger.info("[克隆] 开始 clone_and_speak, text=%s..., voice_id=%s", text[:50], voice_id)
                        spk_path = save_voice_sample(voice_b64, voice_id)
                        logger.info("[克隆] 声音样本已保存, 开始合成...")
                        wav_bytes = await clone_and_synthesize(
                            text,
                            spk_path,
                            emo_alpha=emo_alpha,
                            use_emo_text=use_emo_text,
                        )
                        b64 = base64.b64encode(wav_bytes).decode("utf-8")
                        logger.info("[克隆] clone_and_speak 完成, 返回音频 size=%s", len(wav_bytes))
                        try:
                            await websocket.send(
                                json.dumps(
                                    {
                                        "success": True,
                                        "audio": b64,
                                        "format": "wav",
                                        "voice_id": voice_id,
                                    }
                                )
                            )
                            logger.info("[克隆] clone_and_speak 完成, 已返回音频")
                        except websockets.exceptions.ConnectionClosed:
                            logger.warning("[克隆] clone_and_speak 完成，但客户端已断开连接（可能超时）")
                    finally:
                        _active_user_requests = max(0, _active_user_requests - 1)

                elif action == "register_voice":
                    voice_b64 = data.get("voice_sample", "")
                    voice_id = data.get("voice_id", "default")
                    voice_name = data.get("voice_name", "未命名")

                    if not voice_b64:
                        await websocket.send(json.dumps({"error": "声音样本不能为空"}))
                        continue

                    logger.info("[注册] 开始 register_voice: name=%s, id=%s", voice_name, voice_id)
                    save_voice_sample(voice_b64, voice_id)
                    meta = {
                        "id": voice_id,
                        "name": voice_name,
                        "sample_path": str(VOICES_DIR / f"{voice_id}.wav"),
                    }
                    meta_path = VOICES_DIR / f"{voice_id}.json"
                    meta_path.write_text(
                        json.dumps(meta, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                    logger.info("[注册] register_voice 完成")
                    await websocket.send(
                        json.dumps(
                            {
                                "success": True,
                                "voice_id": voice_id,
                                "message": "声音注册成功",
                            }
                        )
                    )

                elif action == "synthesize":
                    _active_user_requests += 1
                    try:
                        text = data.get("text", "").strip()
                        voice_id = data.get("voice_id", "default")
                        emo_alpha = float(data.get("emo_alpha", 1.0))
                        use_emo_text = bool(data.get("use_emo_text", False))

                        if not text:
                            await websocket.send(json.dumps({"error": "文本不能为空"}))
                            continue

                        spk_path = VOICES_DIR / f"{voice_id}.wav"
                        if not spk_path.exists():
                            await websocket.send(
                                json.dumps({"error": f"声音 ID '{voice_id}' 不存在，请先注册"})
                            )
                            continue

                        logger.info("[合成] 开始 synthesize: text=%s..., voice_id=%s", text[:50], voice_id)
                        wav_bytes = await clone_and_synthesize(
                            text,
                            spk_path,
                            voice_id=voice_id,
                            emo_alpha=emo_alpha,
                            use_emo_text=use_emo_text,
                        )
                        b64 = base64.b64encode(wav_bytes).decode("utf-8")
                        try:
                            await websocket.send(
                                json.dumps(
                                    {
                                        "success": True,
                                        "audio": b64,
                                        "format": "wav",
                                        "voice_id": voice_id,
                                    }
                                )
                            )
                            logger.info("[合成] synthesize 完成, 已返回音频")
                        except websockets.exceptions.ConnectionClosed:
                            logger.warning("[合成] synthesize 完成，但客户端已断开连接（可能超时）")
                    finally:
                        _active_user_requests = max(0, _active_user_requests - 1)

                elif action == "check_status":
                    # 检查模型是否就绪
                    await websocket.send(
                        json.dumps({
                            "success": True,
                            "model_ready": _model_ready,
                            "has_model": tts_model is not None,
                        })
                    )
                elif action == "list_voices":
                    voices = []
                    for m in VOICES_DIR.glob("*.json"):
                        try:
                            meta = json.loads(m.read_text(encoding="utf-8"))
                            voices.append(
                                {"id": meta["id"], "name": meta.get("name", meta["id"])}
                            )
                        except Exception as e:
                            logger.warning("读取元数据失败 %s: %s", m, e)
                    logger.info("[列表] list_voices 返回 %s 个声音", len(voices))
                    await websocket.send(json.dumps({"success": True, "voices": voices}))

                else:
                    await websocket.send(
                        json.dumps(
                            {
                                "error": f"未知操作: {action}",
                                "supported_actions": [
                                    "clone_and_speak",
                                    "register_voice",
                                    "synthesize",
                                    "list_voices",
                                ],
                            }
                        )
                    )
            except json.JSONDecodeError as e:
                logger.warning("[错误] 无效的 JSON: %s", e)
                await websocket.send(json.dumps({"error": "无效的 JSON"}))
            except Exception as e:
                logger.exception("[错误] 处理请求失败")
                await websocket.send(json.dumps({"error": str(e)}))

    except websockets.exceptions.ConnectionClosed as e:
        logger.info("[连接] 关闭: %s (code=%s, reason=%s)", addr, e.code, e.reason)
    except Exception as e:
        logger.exception("[连接] 错误: %s", e)


def _log_acceleration_info():
    """打印加速相关配置：MPS/CUDA/CPU、torch.compile"""
    if torch is None:
        return
    # 设备优先级与 IndexTTS2 一致：cuda > xpu > mps > cpu
    if torch.cuda.is_available():
        logger.info("加速: 将使用 CUDA (NVIDIA GPU)")
    elif getattr(torch, "xpu", None) and torch.xpu.is_available():
        logger.info("加速: 将使用 XPU (Intel GPU)")
    elif getattr(getattr(torch, "backends", None), "mps", None) and torch.backends.mps.is_available():
        logger.info("加速: 将使用 MPS (Mac M 系 Metal)，较 CPU 更快")
    else:
        logger.info("加速: 使用 CPU。Mac M 系会自动用 MPS；NVIDIA GPU 用 CUDA。")
    use_tc = os.environ.get("VOICE_CLONE_USE_TORCH_COMPILE", "").lower() in ("1", "true", "yes")
    if use_tc:
        logger.info("torch.compile: 已启用 (VOICE_CLONE_USE_TORCH_COMPILE=1)，首次推理较慢、后续加速")
    else:
        logger.info("torch.compile: 未启用。启用: VOICE_CLONE_USE_TORCH_COMPILE=1 ./scripts/start_voice_clone.sh")


async def main():
    host = os.environ.get("VOICE_CLONE_HOST", "0.0.0.0")
    port = int(os.environ.get("VOICE_CLONE_PORT", "10097"))

    logger.info("=" * 60)
    logger.info("语音克隆服务 - IndexTTS2")
    logger.info("=" * 60)
    logger.info("WebSocket: ws://%s:%d", host, port)
    logger.info("CONFIG_PATH: %s", CONFIG_PATH)
    logger.info("MODEL_DIR: %s", MODEL_DIR)
    logger.info("声音目录: %s", VOICES_DIR)
    logger.info("HF_HUB_CACHE: %s", os.environ.get("HF_HUB_CACHE"))
    if INDEX_TTS_HOME:
        logger.info("INDEX_TTS_HOME: %s", INDEX_TTS_HOME)
    _log_acceleration_info()
    logger.info("=" * 60)

    try:
        initialize_model()
        if tts_model is not None:
            logger.info("推理设备: %s", getattr(tts_model, "device", "?"))
            # 模型加载完成后，延迟启动自动预加载（让服务先稳定运行）
            # 可通过环境变量 DISABLE_AUTO_PRELOAD=1 禁用自动预加载
            if os.environ.get("DISABLE_AUTO_PRELOAD", "").lower() not in ("1", "true", "yes"):
                async def delayed_preload():
                    # 延迟 3 秒启动预加载，让服务先稳定运行
                    await asyncio.sleep(3)
                    await auto_preload_common_phrases()
                asyncio.create_task(delayed_preload())
            else:
                logger.info("[预加载] 自动预加载已禁用（DISABLE_AUTO_PRELOAD=1）")
    except Exception as e:
        logger.warning("预加载模型失败，将在首次请求时重试: %s", e)

    # 增加消息大小限制到 10MB，以支持 Base64 编码的音频文件（默认 1MB 不够）
    max_size = 10 * 1024 * 1024  # 10MB
    logger.info("WebSocket 消息大小限制: %d MB", max_size // (1024 * 1024))
    logger.info("TTS 缓存: 最多 %d 条 (text+voice_id)，重复短语直接命中", TTS_CACHE_MAX)

    async with websockets.serve(handle_client, host, port, max_size=max_size):
        logger.info("服务已启动，等待连接...")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("服务已停止")
    except Exception as e:
        logger.error("启动失败: %s", e)
        sys.exit(1)

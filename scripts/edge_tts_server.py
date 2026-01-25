"""
Edge TTS 语音合成服务端
使用微软Edge TTS - 完全免费，无需API密钥

使用方法:
1. 安装依赖: pip install edge-tts websockets
2. 运行: python edge_tts_server.py
3. WebSocket端点: ws://localhost:10096

支持的中文声音:
- zh-CN-XiaoxiaoNeural (女声，默认)
- zh-CN-YunxiNeural (男声)
- zh-CN-XiaoyiNeural (女童声)
"""

import asyncio
import json
import logging
import sys
import io
import base64
from pathlib import Path

try:
    import edge_tts
    import websockets
except ImportError:
    print("请先安装依赖: pip install edge-tts websockets")
    sys.exit(1)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 默认声音配置
DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"  # 中文女声

# 可用声音列表
AVAILABLE_VOICES = {
    "xiaoxiao": "zh-CN-XiaoxiaoNeural",    # 女声
    "yunxi": "zh-CN-YunxiNeural",          # 男声
    "xiaoyi": "zh-CN-XiaoyiNeural",        # 女童声
    "yunyang": "zh-CN-YunyangNeural",      # 新闻男声
    "xiaoxuan": "zh-CN-XiaoxuanNeural",    # 女声
}

async def text_to_speech(text: str, voice: str = DEFAULT_VOICE) -> bytes:
    """将文本转换为语音，返回MP3字节数据"""
    communicate = edge_tts.Communicate(text, voice)
    
    audio_data = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.write(chunk["data"])
    
    return audio_data.getvalue()

async def handle_client(websocket, path=None):
    """处理WebSocket客户端请求"""
    client_addr = websocket.remote_address
    logger.info(f"新客户端连接: {client_addr}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                text = data.get("text", "")
                voice_key = data.get("voice", "xiaoxiao")
                voice = AVAILABLE_VOICES.get(voice_key, DEFAULT_VOICE)
                
                if not text:
                    await websocket.send(json.dumps({"error": "文本不能为空"}))
                    continue
                
                logger.info(f"合成语音: {text[:50]}... 声音: {voice}")
                
                # 生成语音
                audio_bytes = await text_to_speech(text, voice)
                
                # 返回Base64编码的音频
                audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                await websocket.send(json.dumps({
                    "success": True,
                    "audio": audio_base64,
                    "format": "mp3"
                }))
                
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"error": "无效的JSON格式"}))
            except Exception as e:
                logger.error(f"处理请求失败: {e}")
                await websocket.send(json.dumps({"error": str(e)}))
                
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"客户端断开连接: {client_addr}")

async def main():
    """主函数"""
    host = "0.0.0.0"
    port = 10096
    
    logger.info(f"启动Edge TTS WebSocket服务器: ws://{host}:{port}")
    logger.info(f"默认声音: {DEFAULT_VOICE}")
    logger.info(f"可用声音: {list(AVAILABLE_VOICES.keys())}")
    
    async with websockets.serve(handle_client, host, port):
        logger.info("服务器已启动，等待连接...")
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("服务器已停止")

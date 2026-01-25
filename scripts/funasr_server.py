"""
FunASR WebSocket Server for EmoBit (兼容新版websockets)
语音识别服务端 - 正确处理WebSocket音频流

使用方法:
pip install "numpy<2" funasr modelscope websockets
python funasr_server.py
"""

import asyncio
import json
import logging
import sys
import numpy as np

try:
    import websockets
    from funasr import AutoModel
except ImportError as e:
    print(f"请先安装依赖: pip install \"numpy<2\" funasr modelscope websockets")
    print(f"错误: {e}")
    sys.exit(1)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 全局模型实例
model = None

def load_model():
    """加载ASR模型"""
    global model
    logger.info("正在加载FunASR模型...")
    
    try:
        model = AutoModel(
            model="paraformer-zh",
            vad_model="fsmn-vad",
            punc_model="ct-punc",
            device="cpu",
        )
        logger.info("模型加载完成!")
        return True
    except Exception as e:
        logger.error("模型加载失败: %s", e)
        return False

async def handle_client(websocket):
    """处理WebSocket客户端连接 (新版websockets API - 不需要path参数)"""
    client_addr = websocket.remote_address
    logger.info(f"新客户端连接: {client_addr}")
    
    audio_buffer = bytearray()
    is_speaking = True
    
    try:
        async for message in websocket:
            # 处理文本消息（控制命令）
            if isinstance(message, str):
                try:
                    data = json.loads(message)
                    logger.info(f"收到控制消息: {data}")
                    
                    if data.get("type") == "start":
                        audio_buffer.clear()
                        is_speaking = True
                        await websocket.send(json.dumps({"type": "ready"}))
                        
                    elif data.get("type") == "stop" or data.get("is_speaking") == False:
                        is_speaking = False
                        if len(audio_buffer) > 1000:
                            result = process_audio(bytes(audio_buffer))
                            await websocket.send(json.dumps({
                                "text": result,
                                "is_final": True
                            }))
                        audio_buffer.clear()
                        
                except json.JSONDecodeError:
                    logger.warning(f"无效JSON: {message[:100]}")
                continue
            
            # 处理二进制音频数据
            if isinstance(message, bytes) and is_speaking:
                audio_buffer.extend(message)
                
                if len(audio_buffer) >= 32000:
                    result = process_audio(bytes(audio_buffer))
                    if result and result.strip():
                        await websocket.send(json.dumps({
                            "text": result,
                            "is_final": False
                        }))
                    audio_buffer = audio_buffer[-16000:]
                    
    except websockets.exceptions.ConnectionClosed as e:
        logger.info(f"客户端断开连接: {client_addr}")
    except Exception as e:
        logger.error(f"处理消息时出错: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if len(audio_buffer) > 1000:
            result = process_audio(bytes(audio_buffer))
            if result and result.strip():
                try:
                    await websocket.send(json.dumps({
                        "text": result,
                        "is_final": True
                    }))
                except:
                    pass

def process_audio(audio_bytes):
    """处理音频数据并返回识别结果"""
    global model
    
    if model is None or len(audio_bytes) < 1000:
        return ""
    
    try:
        audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
        audio_float32 = audio_int16.astype(np.float32) / 32768.0
        
        result = model.generate(input=audio_float32, batch_size_s=300)
        
        if result and len(result) > 0:
            text = result[0].get("text", "")
            if text:
                logger.info(f"识别结果: {text}")
            return text
        return ""
    except Exception as e:
        logger.error(f"音频处理失败: {e}")
        return ""

async def main():
    """主函数"""
    if not load_model():
        logger.error("无法启动服务器: 模型加载失败")
        return
    
    host = "0.0.0.0"
    port = 10095
    
    logger.info(f"启动FunASR WebSocket服务器: ws://{host}:{port}")
    
    # 使用新版websockets API
    async with websockets.serve(handle_client, host, port, max_size=10*1024*1024):
        logger.info("服务器已启动，等待连接...")
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("服务器已停止")

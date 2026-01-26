#!/bin/bash
# 启动语音克隆服务脚本（使用 conda 环境 emobit）

# 使用的 conda 环境名称，可通过环境变量覆盖
CONDA_ENV="${CONDA_ENV:-emobit}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INDEX_TTS_DIR="$PROJECT_ROOT/index-tts"
SERVER_SCRIPT="$SCRIPT_DIR/voice_clone_server.py"

# 检查 index-tts 目录
if [ ! -d "$INDEX_TTS_DIR" ]; then
    echo "❌ 错误: 未找到 index-tts 目录"
    echo "请先运行: ./scripts/setup_voice_clone.sh"
    exit 1
fi

# 检查服务器脚本
if [ ! -f "$SERVER_SCRIPT" ]; then
    echo "❌ 错误: 未找到 voice_clone_server.py"
    exit 1
fi

# 检查并激活 conda 环境
if ! command -v conda &> /dev/null; then
    echo "❌ 错误: 未找到 conda 命令"
    exit 1
fi

CONDA_BASE="$(conda info --base 2>/dev/null)"
if [ -z "$CONDA_BASE" ]; then
    echo "❌ 错误: 无法获取 conda 路径"
    exit 1
fi

# shellcheck source=/dev/null
source "$CONDA_BASE/etc/profile.d/conda.sh"
if ! conda activate "$CONDA_ENV" 2>/dev/null; then
    echo "❌ 错误: 未找到 conda 环境 '$CONDA_ENV'"
    echo "请先创建并设置: conda create -n $CONDA_ENV python=3.10"
    echo "或指定环境: CONDA_ENV=你的环境名 ./scripts/start_voice_clone.sh"
    exit 1
fi

# 设置环境变量
export INDEX_TTS_HOME="${INDEX_TTS_HOME:-$INDEX_TTS_DIR}"

# 可选：启用 torch.compile 加速（首次推理较慢，后续请求更快）
# 用法: VOICE_CLONE_USE_TORCH_COMPILE=1 ./scripts/start_voice_clone.sh
if [ -n "${VOICE_CLONE_USE_TORCH_COMPILE}" ]; then
    export VOICE_CLONE_USE_TORCH_COMPILE
    echo "[加速] torch.compile 已启用 (VOICE_CLONE_USE_TORCH_COMPILE=$VOICE_CLONE_USE_TORCH_COMPILE)"
fi

echo "=========================================="
echo "启动语音克隆服务"
echo "=========================================="
echo "Conda 环境: $CONDA_ENV"
echo "Python: $(which python)"
echo "IndexTTS2 目录: $INDEX_TTS_DIR"
echo "WebSocket: ws://localhost:10097"
echo "------------------------------------------"
echo "加速说明:"
echo "  • Mac M 系: 自动使用 MPS (Metal)，无需配置"
echo "  • torch.compile: VOICE_CLONE_USE_TORCH_COMPILE=1 $0"
echo "=========================================="
echo ""

# 进入 index-tts 目录并启动（工作目录需在 index-tts 以正确加载配置）
cd "$INDEX_TTS_DIR"

echo "正在启动服务..."
echo "按 Ctrl+C 停止服务"
echo ""

python "$SERVER_SCRIPT"

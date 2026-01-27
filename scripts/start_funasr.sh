#!/bin/bash
# 启动 FunASR 语音识别服务脚本（使用 conda 环境 emobit）

# 使用的 conda 环境名称，可通过环境变量覆盖
CONDA_ENV="${CONDA_ENV:-emobit}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_SCRIPT="$SCRIPT_DIR/funasr_server.py"

# 检查服务器脚本
if [ ! -f "$SERVER_SCRIPT" ]; then
    echo "❌ 错误: 未找到 funasr_server.py"
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
    echo "或指定环境: CONDA_ENV=你的环境名 ./scripts/start_funasr.sh"
    exit 1
fi

echo "=========================================="
echo "启动 FunASR 语音识别服务"
echo "=========================================="
echo "Conda 环境: $CONDA_ENV"
echo "Python: $(which python)"
echo "WebSocket: ws://localhost:10095"
echo "------------------------------------------"
echo "说明:"
echo "  • 首次运行会自动下载模型（约 500MB）"
echo "  • 模型加载需要一些时间，请耐心等待"
echo "  • 支持中文语音识别"
echo "=========================================="
echo ""

echo "正在启动服务..."
echo "按 Ctrl+C 停止服务"
echo ""

python "$SERVER_SCRIPT"

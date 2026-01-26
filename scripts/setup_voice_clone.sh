#!/bin/bash
# 语音克隆功能快速设置脚本（使用 conda 环境 emobit）

set -e

# 使用的 conda 环境名称，可通过环境变量覆盖
CONDA_ENV="${CONDA_ENV:-emobit}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INDEX_TTS_DIR="$PROJECT_ROOT/index-tts"

echo "=========================================="
echo "语音克隆功能设置脚本"
echo "=========================================="
echo "Conda 环境: $CONDA_ENV"
echo ""

# 检查并激活 conda 环境
if ! command -v conda &> /dev/null; then
    echo "❌ 错误: 未找到 conda 命令"
    echo "请先安装 Anaconda 或 Miniconda"
    exit 1
fi

CONDA_BASE="$(conda info --base 2>/dev/null)"
if [ -z "$CONDA_BASE" ]; then
    echo "❌ 错误: 无法获取 conda 路径"
    exit 1
fi

echo "📦 激活 conda 环境: $CONDA_ENV"
# shellcheck source=/dev/null
source "$CONDA_BASE/etc/profile.d/conda.sh"
if ! conda activate "$CONDA_ENV" 2>/dev/null; then
    echo "❌ 错误: 未找到 conda 环境 '$CONDA_ENV'"
    echo "请先创建: conda create -n $CONDA_ENV python=3.10"
    echo "（IndexTTS2 要求 Python >= 3.10）"
    exit 1
fi

echo "✅ 当前 Python: $(which python) ($(python --version 2>&1))"
echo ""

# 检查 index-tts 目录
if [ ! -d "$INDEX_TTS_DIR" ]; then
    echo "❌ 错误: 未找到 index-tts 目录"
    echo "请先运行: git clone https://github.com/index-tts/index-tts.git"
    exit 1
fi

cd "$INDEX_TTS_DIR"

# 步骤 1: 安装 index-tts 依赖（pip 可编辑安装）
echo "📦 步骤 1/3: 安装 IndexTTS2 依赖..."
echo "这可能需要几分钟，请耐心等待..."
if pip install -e . -i "https://mirrors.aliyun.com/pypi/simple" 2>/dev/null; then
    echo "✅ IndexTTS2 安装完成（阿里云镜像）"
else
    echo "⚠️  阿里云镜像失败，尝试默认源..."
    pip install -e .
fi

# 步骤 2: 安装 websockets
echo ""
echo "📦 步骤 2/3: 安装 websockets..."
pip install "websockets>=12.0"
echo "✅ websockets 已安装"

# 步骤 3: 检查模型
echo ""
echo "📦 步骤 3/3: 检查模型文件..."
if [ -L "checkpoints" ] || [ -d "checkpoints" ]; then
    if [ -f "checkpoints/config.yaml" ]; then
        echo "✅ 模型文件已就绪"
    else
        echo "⚠️  警告: checkpoints 目录存在但缺少 config.yaml"
        echo "请确认模型已正确下载或软链接已创建"
    fi
else
    echo "⚠️  警告: 未找到 checkpoints 目录"
    echo "请运行以下命令之一下载模型:"
    echo "  export MODELSCOPE_DOMAIN=www.modelscope.ai"
    echo "  modelscope download --model IndexTeam/IndexTTS-2 --local_dir checkpoints"
    echo "或创建软链接: ln -s /path/to/IndexTTS-2 checkpoints"
fi

echo ""
echo "=========================================="
echo "✅ 设置完成！"
echo "=========================================="
echo ""
echo "下一步：启动语音克隆服务"
echo ""
echo "   conda activate $CONDA_ENV"
echo "   ./scripts/start_voice_clone.sh"
echo ""
echo "或手动启动:"
echo "   conda activate $CONDA_ENV"
echo "   export INDEX_TTS_HOME=$INDEX_TTS_DIR"
echo "   cd $INDEX_TTS_DIR"
echo "   python $SCRIPT_DIR/voice_clone_server.py"
echo ""

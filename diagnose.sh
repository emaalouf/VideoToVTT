#!/bin/bash

echo "🔍 Diagnosing Video-to-VTT Setup..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "===========================================" 
echo "🏠 Current Directory"
echo "===========================================" 
pwd
echo ""

echo "===========================================" 
echo "📁 Whisper.cpp Directory Structure"
echo "===========================================" 
if [ -d "whisper.cpp" ]; then
    print_success "whisper.cpp directory exists"
    ls -la whisper.cpp/ | head -20
else
    print_error "whisper.cpp directory not found!"
fi
echo ""

echo "===========================================" 
echo "⚙️ Executable Check"
echo "===========================================" 
for path in "whisper.cpp/main" "whisper.cpp/build/main"; do
    if [ -f "$path" ]; then
        print_success "$path exists"
        ls -la "$path"
        echo "Testing executable..."
        if ./"$path" --help &>/dev/null; then
            print_success "$path is executable and working"
        else
            print_warning "$path exists but may not be working properly"
        fi
    else
        print_error "$path not found"
    fi
done
echo ""

echo "===========================================" 
echo "📦 Models Check"
echo "===========================================" 
if [ -d "whisper.cpp/models" ]; then
    print_success "Models directory exists"
    ls -la whisper.cpp/models/
    
    for model in "ggml-medium.bin" "ggml-base.bin"; do
        if [ -f "whisper.cpp/models/$model" ]; then
            size=$(ls -lh "whisper.cpp/models/$model" | awk '{print $5}')
            print_success "$model found (size: $size)"
        else
            print_warning "$model not found"
        fi
    done
else
    print_error "Models directory not found!"
fi
echo ""

echo "===========================================" 
echo "🔧 Environment Configuration"
echo "===========================================" 
if [ -f ".env" ]; then
    print_success ".env file exists"
    echo "Current configuration:"
    grep -E "WHISPER|API_VIDEO|LLM" .env || echo "No whisper/API configuration found"
else
    print_error ".env file not found!"
fi
echo ""

echo "===========================================" 
echo "📊 System Dependencies"
echo "===========================================" 
for cmd in git cmake make gcc node npm ffmpeg; do
    if command -v $cmd &> /dev/null; then
        version=$($cmd --version 2>/dev/null | head -1)
        print_success "$cmd: $version"
    else
        print_error "$cmd not found"
    fi
done
echo ""

echo "===========================================" 
echo "💡 Recommendations"
echo "===========================================" 

if [ ! -f "whisper.cpp/main" ] && [ -f "whisper.cpp/build/main" ]; then
    print_warning "Main executable is in build directory. Run:"
    echo "   cp whisper.cpp/build/main whisper.cpp/main"
    echo "   chmod +x whisper.cpp/main"
fi

if [ ! -f ".env" ]; then
    print_warning "No .env file found. Run:"
    echo "   cp config.example.env .env"
fi

if [ ! -f "whisper.cpp/models/ggml-medium.bin" ]; then
    print_warning "Medium model not found. Run:"
    echo "   cd whisper.cpp && bash ./models/download-ggml-model.sh medium"
fi

echo ""
echo "🔍 Diagnosis complete!" 
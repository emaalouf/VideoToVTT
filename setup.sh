#!/bin/bash

echo "🚀 Setting up Video-to-VTT Processing Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect operating system
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt &> /dev/null; then
            echo "ubuntu"
        elif command -v yum &> /dev/null; then
            echo "centos"
        else
            echo "linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    else
        echo "unknown"
    fi
}

# Install system dependencies
install_dependencies() {
    local os=$(detect_os)
    
    print_status "Detected OS: $os"
    
    case $os in
        ubuntu)
            print_status "Installing Ubuntu dependencies..."
            if command -v sudo &> /dev/null; then
                sudo apt update
                sudo apt install -y cmake build-essential git curl nodejs npm
            else
                apt update
                apt install -y cmake build-essential git curl nodejs npm
            fi
            ;;
        centos)
            print_status "Installing CentOS dependencies..."
            if command -v sudo &> /dev/null; then
                sudo yum groupinstall -y "Development Tools"
                sudo yum install -y cmake git curl nodejs npm
            else
                yum groupinstall -y "Development Tools"
                yum install -y cmake git curl nodejs npm
            fi
            ;;
        macos)
            print_status "macOS detected. Checking for required tools..."
            if ! command -v git &> /dev/null; then
                print_warning "Git not found. Please install Xcode Command Line Tools:"
                print_status "xcode-select --install"
            fi
            if ! command -v node &> /dev/null; then
                print_warning "Node.js not found. Please install Node.js from https://nodejs.org/"
            fi
            ;;
        *)
            print_warning "Unknown OS. Please ensure the following are installed:"
            print_status "- git, make, cmake, gcc, node, npm"
            ;;
    esac
}

# Check and install system dependencies
install_dependencies

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
if command -v npm &> /dev/null; then
    npm install
else
    print_error "npm not found. Please install Node.js first."
    exit 1
fi

# Check if git is available
if ! command -v git &> /dev/null; then
    print_error "Git is required but not installed. Please install git first."
    exit 1
fi

# Check if make is available (required for whisper.cpp)
if ! command -v make &> /dev/null; then
    print_error "Make is required but not installed. Please install build tools first."
    exit 1
fi

# Check if cmake is available (required for whisper.cpp)
if ! command -v cmake &> /dev/null; then
    print_error "CMake is required but not installed. Please install cmake first."
    print_status "Ubuntu/Debian: sudo apt install cmake"
    print_status "CentOS/RHEL: sudo yum install cmake"
    print_status "macOS: brew install cmake"
    exit 1
fi

# Clone whisper.cpp if it doesn't exist
if [ ! -d "whisper.cpp" ]; then
    print_status "Cloning whisper.cpp repository..."
    git clone https://github.com/ggerganov/whisper.cpp.git
    cd whisper.cpp
    
    print_status "Compiling whisper.cpp..."
    make
    
    if [ $? -eq 0 ]; then
        print_success "whisper.cpp compiled successfully!"
    else
        print_error "Failed to compile whisper.cpp"
        print_status "Trying alternative build method..."
        
        # Try cmake build as fallback
        mkdir -p build
        cd build
        cmake ..
        make -j $(nproc)
        
        if [ $? -eq 0 ]; then
            print_success "whisper.cpp compiled successfully with cmake!"
            # Copy the binary to the expected location
            cp main ../main
        else
            print_error "Failed to compile whisper.cpp with both methods"
            exit 1
        fi
        cd ..
    fi
    
    cd ..
else
    print_warning "whisper.cpp directory already exists. Skipping clone."
fi

# Download whisper models
MODELS_DIR="whisper.cpp/models"
if [ ! -d "$MODELS_DIR" ]; then
    mkdir -p "$MODELS_DIR"
fi

print_status "Downloading Whisper models..."

# Download medium model (good balance of speed and accuracy)
if [ ! -f "$MODELS_DIR/ggml-medium.bin" ]; then
    print_status "Downloading medium model (recommended)..."
    cd whisper.cpp
    
    # Make sure download script is executable
    chmod +x ./models/download-ggml-model.sh
    bash ./models/download-ggml-model.sh medium
    cd ..
    
    if [ -f "$MODELS_DIR/ggml-medium.bin" ]; then
        print_success "Medium model downloaded successfully!"
    else
        print_error "Failed to download medium model"
        print_status "Trying manual download..."
        
        # Manual download as fallback
        cd "$MODELS_DIR"
        curl -L -o ggml-medium.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
        cd ../../
        
        if [ -f "$MODELS_DIR/ggml-medium.bin" ]; then
            print_success "Medium model downloaded manually!"
        else
            print_warning "Could not download medium model. You may need to download it manually."
        fi
    fi
else
    print_warning "Medium model already exists. Skipping download."
fi

# Optionally download base model (faster but less accurate)
if [ ! -f "$MODELS_DIR/ggml-base.bin" ]; then
    print_status "Downloading base model (faster option)..."
    cd whisper.cpp
    bash ./models/download-ggml-model.sh base
    cd ..
    
    if [ -f "$MODELS_DIR/ggml-base.bin" ]; then
        print_success "Base model downloaded successfully!"
    else
        print_warning "Failed to download base model (optional)"
    fi
fi

# Create output and temp directories
print_status "Creating output directories..."
mkdir -p output
mkdir -p temp

# Copy environment configuration
if [ ! -f ".env" ]; then
    print_status "Creating environment configuration..."
    cp config.example.env .env
    print_success "Environment file created. Please update .env with your settings."
else
    print_warning ".env file already exists. Skipping creation."
fi

# Check FFmpeg installation
if command -v ffmpeg &> /dev/null; then
    print_success "FFmpeg is installed."
else
    print_warning "FFmpeg not found. The application includes ffmpeg-static, but system FFmpeg is recommended."
    print_status "To install FFmpeg:"
    print_status "  macOS: brew install ffmpeg"
    print_status "  Ubuntu/Debian: sudo apt install ffmpeg"
    print_status "  CentOS/RHEL: sudo yum install ffmpeg"
fi

# Test whisper.cpp installation
print_status "Testing whisper.cpp installation..."
if [ -f "whisper.cpp/main" ]; then
    print_success "whisper.cpp main executable found!"
elif [ -f "whisper.cpp/build/main" ]; then
    print_success "whisper.cpp main executable found in build directory!"
    # Copy to expected location
    cp whisper.cpp/build/main whisper.cpp/main
else
    print_warning "whisper.cpp main executable not found. Compilation may have failed."
fi

print_success "Setup completed successfully!"
print_status ""
print_status "Next steps:"
print_status "1. Update .env file with your API keys and paths"
print_status "2. For local LLM integration, set up DeepSeek or Mistral"
print_status "3. Run: npm start"
print_status ""
print_status "Optional: Install system FFmpeg for better performance" 
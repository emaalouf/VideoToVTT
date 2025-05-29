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

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
npm install

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
        exit 1
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
    bash ./models/download-ggml-model.sh medium
    cd ..
    
    if [ -f "$MODELS_DIR/ggml-medium.bin" ]; then
        print_success "Medium model downloaded successfully!"
    else
        print_error "Failed to download medium model"
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

print_success "Setup completed successfully!"
print_status ""
print_status "Next steps:"
print_status "1. Update .env file with your API keys and paths"
print_status "2. For local LLM integration, set up DeepSeek or Mistral"
print_status "3. Run: npm start"
print_status ""
print_status "Optional: Install system FFmpeg for better performance" 
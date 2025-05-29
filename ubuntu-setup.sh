#!/bin/bash

echo "🐧 Ubuntu Server Setup for Video-to-VTT Processing..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Check if running as root or with sudo
check_privileges() {
    if [[ $EUID -eq 0 ]]; then
        SUDO=""
        print_status "Running as root"
    elif command -v sudo &> /dev/null; then
        SUDO="sudo"
        print_status "Using sudo for privileged operations"
    else
        print_error "This script requires root privileges or sudo access"
        exit 1
    fi
}

# Install system dependencies
install_ubuntu_deps() {
    print_status "Updating package lists..."
    $SUDO apt update

    print_status "Installing required packages..."
    $SUDO apt install -y \
        cmake \
        build-essential \
        git \
        curl \
        wget \
        nodejs \
        npm \
        ffmpeg \
        python3 \
        python3-pip

    # Install latest Node.js if the version is too old
    NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ -z "$NODE_VERSION" ]] || [[ "$NODE_VERSION" -lt 16 ]]; then
        print_status "Installing Node.js 18 LTS..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | $SUDO -E bash -
        $SUDO apt-get install -y nodejs
    fi

    print_success "All system dependencies installed!"
}

# Verify installations
verify_installation() {
    print_status "Verifying installations..."
    
    local errors=0
    
    for cmd in git cmake make gcc node npm; do
        if command -v $cmd &> /dev/null; then
            print_success "$cmd is installed"
        else
            print_error "$cmd is not installed"
            ((errors++))
        fi
    done
    
    if [[ $errors -gt 0 ]]; then
        print_error "Some dependencies are missing. Please check the installation."
        exit 1
    fi
    
    print_success "All dependencies verified!"
}

# Main execution
main() {
    print_status "Starting Ubuntu setup for Video-to-VTT Processing..."
    
    check_privileges
    install_ubuntu_deps
    verify_installation
    
    print_success "Ubuntu dependencies setup completed!"
    print_status ""
    print_status "Now run the main setup script:"
    print_status "./setup.sh"
    print_status ""
    print_status "Note: Make sure you're in the VideoToVTT directory"
}

main "$@" 
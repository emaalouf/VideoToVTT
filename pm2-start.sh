#!/bin/bash

echo "🚀 VideoToVTT PM2 Management Script"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

function show_status() {
    echo -e "${CYAN}📊 Current PM2 Status:${NC}"
    pm2 list
    echo ""
}

function start_full_mode() {
    echo -e "${GREEN}🚀 Starting Full Mode (All 474 videos)...${NC}"
    echo -e "${YELLOW}⏱️  Estimated completion time: 12-24 hours${NC}"
    echo -e "${BLUE}💾 Memory limit: 2GB with auto-restart${NC}"
    echo ""
    
    # Stop any existing processes first
    pm2 stop videotovtt-full 2>/dev/null || true
    pm2 delete videotovtt-full 2>/dev/null || true
    
    # Start Full Mode
    pm2 start ecosystem.config.js --only videotovtt-full
    
    echo -e "${GREEN}✅ Full Mode started successfully!${NC}"
    echo ""
    show_status
}

function start_turbo_mode() {
    echo -e "${GREEN}🚄 Starting Turbo Mode (10 videos for testing)...${NC}"
    echo -e "${YELLOW}⏱️  Estimated completion time: 30-60 minutes${NC}"
    echo ""
    
    # Stop and start Turbo Mode
    pm2 stop videotovtt-turbo 2>/dev/null || true
    pm2 delete videotovtt-turbo 2>/dev/null || true
    pm2 start ecosystem.config.js --only videotovtt-turbo
    
    echo -e "${GREEN}✅ Turbo Mode started successfully!${NC}"
    echo ""
    show_status
}

function start_balanced_mode() {
    echo -e "${GREEN}⚖️ Starting Balanced Mode (100 videos)...${NC}"
    echo -e "${YELLOW}⏱️  Estimated completion time: 4-8 hours${NC}"
    echo ""
    
    # Stop and start Balanced Mode
    pm2 stop videotovtt-balanced 2>/dev/null || true
    pm2 delete videotovtt-balanced 2>/dev/null || true
    pm2 start ecosystem.config.js --only videotovtt-balanced
    
    echo -e "${GREEN}✅ Balanced Mode started successfully!${NC}"
    echo ""
    show_status
}

function stop_all() {
    echo -e "${RED}🛑 Stopping all VideoToVTT processes...${NC}"
    pm2 stop videotovtt-full videotovtt-turbo videotovtt-balanced 2>/dev/null || true
    echo -e "${GREEN}✅ All processes stopped${NC}"
    echo ""
    show_status
}

function restart_full() {
    echo -e "${YELLOW}🔄 Restarting Full Mode...${NC}"
    pm2 restart videotovtt-full
    echo -e "${GREEN}✅ Full Mode restarted${NC}"
    echo ""
    show_status
}

function show_logs() {
    echo -e "${BLUE}📝 Real-time logs for Full Mode:${NC}"
    echo -e "${YELLOW}Press Ctrl+C to exit log view${NC}"
    echo ""
    pm2 logs videotovtt-full --lines 50
}

function show_monitor() {
    echo -e "${PURPLE}📊 Starting real-time monitor...${NC}"
    echo -e "${YELLOW}Press Ctrl+C to exit monitor${NC}"
    echo ""
    node monitor.js
}

function check_processed() {
    echo -e "${CYAN}📊 Checking processed videos...${NC}"
    
    if [ -d "./output" ]; then
        total_files=$(find ./output -name "*.vtt" | wc -l)
        unique_videos=$(find ./output -name "*.vtt" | sed 's/_[a-z][a-z]\.vtt$//' | sort -u | wc -l)
        
        echo -e "${GREEN}📁 Total VTT files: ${total_files}${NC}"
        echo -e "${GREEN}🎬 Unique videos processed: ${unique_videos}${NC}"
        echo -e "${BLUE}🎯 Target: 474 videos × 5 languages = 2,370 files${NC}"
        
        if [ $total_files -gt 0 ]; then
            progress=$(echo "scale=1; $unique_videos * 100 / 474" | bc 2>/dev/null || echo "0")
            echo -e "${YELLOW}📈 Progress: ${progress}%${NC}"
        fi
    else
        echo -e "${RED}❌ Output directory not found${NC}"
    fi
    echo ""
}

function cleanup_temp() {
    echo -e "${YELLOW}🧹 Cleaning temporary files...${NC}"
    rm -rf ./temp/*
    echo -e "${GREEN}✅ Temporary files cleaned${NC}"
    echo ""
}

# Main menu
case "$1" in
    "full")
        start_full_mode
        ;;
    "turbo")
        start_turbo_mode
        ;;
    "balanced")
        start_balanced_mode
        ;;
    "stop")
        stop_all
        ;;
    "restart")
        restart_full
        ;;
    "logs")
        show_logs
        ;;
    "monitor")
        show_monitor
        ;;
    "status")
        show_status
        check_processed
        ;;
    "cleanup")
        cleanup_temp
        ;;
    *)
        echo -e "${PURPLE}🎛️  VideoToVTT PM2 Control Panel${NC}"
        echo ""
        echo -e "${GREEN}Available commands:${NC}"
        echo -e "  ${CYAN}./pm2-start.sh full${NC}     - Start Full Mode (all 474 videos)"
        echo -e "  ${CYAN}./pm2-start.sh turbo${NC}    - Start Turbo Mode (10 videos)"
        echo -e "  ${CYAN}./pm2-start.sh balanced${NC} - Start Balanced Mode (100 videos)"
        echo -e "  ${CYAN}./pm2-start.sh stop${NC}     - Stop all processes"
        echo -e "  ${CYAN}./pm2-start.sh restart${NC}  - Restart Full Mode"
        echo -e "  ${CYAN}./pm2-start.sh logs${NC}     - Show real-time logs"
        echo -e "  ${CYAN}./pm2-start.sh monitor${NC}  - Show progress monitor"
        echo -e "  ${CYAN}./pm2-start.sh status${NC}   - Show status & progress"
        echo -e "  ${CYAN}./pm2-start.sh cleanup${NC}  - Clean temporary files"
        echo ""
        show_status
        check_processed
        ;;
esac 
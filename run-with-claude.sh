#!/bin/bash

echo "🚀 VideoToVTT with Claude 3 Haiku"
echo "================================="
echo ""

# Set the environment variable to force Claude 3 Haiku
export FORCE_PAID_MODEL=anthropic/claude-3-haiku

echo "🔧 Configuration:"
echo "   Model: $FORCE_PAID_MODEL"
echo "   OpenRouter API Key: ${OPENROUTER_API_KEY:0:10}..."
echo ""

# Check if fast-processor.js exists
if [ ! -f "fast-processor.js" ]; then
    echo "❌ fast-processor.js not found!"
    echo "Please run this script from the VideoToVTT directory"
    exit 1
fi

echo "🎯 PM2 Commands:"
echo ""
echo "📋 To start the processor:"
echo "   pm2 start fast-processor.js --name videotovtt-claude"
echo ""
echo "📋 To monitor logs:"
echo "   pm2 logs videotovtt-claude"
echo ""
echo "📋 To check status:"
echo "   pm2 status"
echo ""
echo "📋 To restart:"
echo "   pm2 restart videotovtt-claude"
echo ""
echo "📋 To stop:"
echo "   pm2 stop videotovtt-claude"
echo ""

# Prompt user for action
read -p "🚀 Start the processor now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔄 Starting VideoToVTT processor with Claude 3 Haiku..."
    pm2 start fast-processor.js --name videotovtt-claude
    echo ""
    echo "✅ Started! Monitor with: pm2 logs videotovtt-claude"
else
    echo "👍 Ready to start manually when you're ready!"
fi 
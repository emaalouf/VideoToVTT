#!/bin/bash

echo "🚀 VideoToVTT with GPT-4o-mini"
echo "==============================="
echo ""

# Set the environment variable to force GPT-4o-mini
export FORCE_PAID_MODEL=openai/gpt-4o-mini

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
echo "   pm2 start fast-processor.js --name videotovtt-gpt4o"
echo ""
echo "📋 To monitor logs:"
echo "   pm2 logs videotovtt-gpt4o"
echo ""
echo "📋 To check status:"
echo "   pm2 status"
echo ""
echo "📋 To restart:"
echo "   pm2 restart videotovtt-gpt4o"
echo ""
echo "📋 To stop:"
echo "   pm2 stop videotovtt-gpt4o"
echo ""

# Prompt user for action
read -p "🚀 Start the processor now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔄 Starting VideoToVTT processor with GPT-4o-mini..."
    pm2 start fast-processor.js --name videotovtt-gpt4o
    echo ""
    echo "✅ Started! Monitor with: pm2 logs videotovtt-gpt4o"
else
    echo "👍 Ready to start manually when you're ready!"
fi 
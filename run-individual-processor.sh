#!/bin/bash

echo "🚀 Starting Individual Translation Processor with PM2..."

# Stop existing processes if running
pm2 stop videotovtt-individual 2>/dev/null || true
pm2 delete videotovtt-individual 2>/dev/null || true

# Start the individual translation processor
pm2 start individual-translation-processor.js \
  --name "videotovtt-individual" \
  --interpreter="node" \
  --time \
  --max-memory-restart=4G \
  --restart-delay=5000 \
  --exp-backoff-restart-delay=100 \
  --max-restarts=3

echo "✅ Individual Translation Processor started!"
echo ""
echo "📊 Monitor with:"
echo "  pm2 logs videotovtt-individual"
echo "  pm2 monit"
echo ""
echo "🛑 Stop with:"
echo "  pm2 stop videotovtt-individual" 
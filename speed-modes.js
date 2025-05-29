#!/usr/bin/env node

import { spawn } from 'child_process';
import colors from 'colors';
import fs from 'fs-extra';

console.log(colors.rainbow('🚀 VideoToVTT Speed Mode Selector\n'));

const modes = [
  {
    name: 'TURBO MODE',
    emoji: '🚄',
    description: 'Process first 10 videos only (for testing/quick results)',
    estimatedTime: '30-60 minutes',
    config: {
      MAX_VIDEOS_TO_PROCESS: '10',
      MAX_CONCURRENT_VIDEOS: '5',
      TRANSLATION_BATCH_SIZE: '20',
      SKIP_EXISTING_VTTS: 'true'
    }
  },
  {
    name: 'FAST MODE', 
    emoji: '🏃‍♂️',
    description: 'Process last 7 days of videos only',
    estimatedTime: '2-4 hours',
    config: {
      PROCESS_LAST_N_DAYS: '7',
      MAX_CONCURRENT_VIDEOS: '5',
      TRANSLATION_BATCH_SIZE: '15',
      SKIP_EXISTING_VTTS: 'true'
    }
  },
  {
    name: 'BALANCED MODE',
    emoji: '⚖️',
    description: 'Process first 100 videos with optimizations',
    estimatedTime: '4-8 hours',
    config: {
      MAX_VIDEOS_TO_PROCESS: '100',
      MAX_CONCURRENT_VIDEOS: '3',
      TRANSLATION_BATCH_SIZE: '12',
      SKIP_EXISTING_VTTS: 'true'
    }
  },
  {
    name: 'FULL MODE',
    emoji: '🐌',
    description: 'Process ALL 474 videos (skip already processed)',
    estimatedTime: '12-24 hours',
    config: {
      MAX_CONCURRENT_VIDEOS: '3',
      TRANSLATION_BATCH_SIZE: '10',
      SKIP_EXISTING_VTTS: 'true'
    }
  },
  {
    name: 'RESUME MODE',
    emoji: '🔄',
    description: 'Continue from where you left off (only unprocessed videos)',
    estimatedTime: 'Depends on remaining videos',
    config: {
      MAX_CONCURRENT_VIDEOS: '4',
      TRANSLATION_BATCH_SIZE: '15',
      SKIP_EXISTING_VTTS: 'true'
    }
  }
];

function displayModes() {
  console.log(colors.yellow('Choose your processing mode:\n'));
  
  modes.forEach((mode, index) => {
    console.log(colors.cyan(`${index + 1}. ${mode.emoji} ${mode.name}`));
    console.log(colors.gray(`   ${mode.description}`));
    console.log(colors.green(`   Estimated time: ${mode.estimatedTime}`));
    console.log('');
  });
  
  console.log(colors.cyan(`6. ${colors.red('🛑 Exit')}`));
}

function createConfigForMode(mode) {
  // Start with base config
  let config = `# API Configuration
API_VIDEO_KEY=B6OEQoXryWfHgE9XRsxHGksPwSiyntyz7J30bQY3XkQ

# Caption Upload Configuration
UPLOAD_CAPTIONS=true
REPLACE_EXISTING_CAPTIONS=true

# Whisper.cpp Configuration
WHISPER_CPP_PATH=./whisper.cpp/main
WHISPER_MODEL_PATH=./whisper.cpp/models/ggml-base.bin

# OpenRouter LLM Configuration
LLM_API_URL=https://openrouter.ai/api/v1/chat/completions
OPENROUTER_API_KEY=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

# Output Configuration
OUTPUT_DIR=./output
TEMP_DIR=./temp

# ${mode.name} SETTINGS
# =====================

`;

  // Add mode-specific settings
  for (const [key, value] of Object.entries(mode.config)) {
    config += `${key}=${value}\n`;
  }

  return config;
}

async function runMode(modeIndex) {
  const mode = modes[modeIndex];
  
  console.log(colors.rainbow(`\n🚀 Starting ${mode.name}...\n`));
  console.log(colors.cyan(`📋 Configuration:`));
  
  Object.entries(mode.config).forEach(([key, value]) => {
    console.log(colors.gray(`   ${key}=${value}`));
  });
  
  console.log(colors.yellow(`\n⏱️  Estimated completion time: ${mode.estimatedTime}`));
  console.log(colors.yellow(`📊 This will be much faster than your current single-threaded approach!\n`));
  
  // Create temporary config file for this mode
  const configContent = createConfigForMode(mode);
  await fs.writeFile('.env.temp', configContent);
  
  // Countdown
  console.log(colors.green('Starting in...'));
  for (let i = 3; i > 0; i--) {
    console.log(colors.yellow(`${i}...`));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(colors.rainbow('🚀 GO!\n'));
  
  // Run the fast processor with the temporary config
  const child = spawn('node', ['fast-processor.js'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });
  
  child.on('close', (code) => {
    // Clean up temp config
    fs.removeSync('.env.temp').catch(() => {});
    
    if (code === 0) {
      console.log(colors.rainbow('\n🎉 Mode completed successfully!'));
    } else {
      console.log(colors.red('\n❌ Mode failed with exit code:', code));
    }
    process.exit(code);
  });
  
  child.on('error', (error) => {
    console.error(colors.red('Failed to start fast processor:'), error.message);
    fs.removeSync('.env.temp').catch(() => {});
    process.exit(1);
  });
}

// Main execution
async function main() {
  displayModes();
  
  // Simple input reading (works cross-platform)
  process.stdout.write(colors.yellow('Enter your choice (1-6): '));
  
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (data) => {
    const choice = parseInt(data.toString().trim());
    
    if (choice >= 1 && choice <= 5) {
      await runMode(choice - 1);
    } else if (choice === 6) {
      console.log(colors.blue('👋 Goodbye!'));
      process.exit(0);
    } else {
      console.log(colors.red('❌ Invalid choice. Please enter 1-6.'));
      process.exit(1);
    }
  });
}

main().catch(console.error); 
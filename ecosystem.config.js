module.exports = {
  apps: [
    {
      name: 'videotovtt-full',
      script: 'fast-processor.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        // Full Mode Configuration - Process ALL 474 videos
        MAX_CONCURRENT_VIDEOS: '3',
        TRANSLATION_BATCH_SIZE: '10',
        SKIP_EXISTING_VTTS: 'true',
        
        // API Configuration
        API_VIDEO_KEY: 'B6OEQoXryWfHgE9XRsxHGksPwSiyntyz7J30bQY3XkQ',
        
        // Caption Upload
        UPLOAD_CAPTIONS: 'true',
        REPLACE_EXISTING_CAPTIONS: 'true',
        
        // Whisper Configuration
        WHISPER_CPP_PATH: './whisper.cpp/main',
        WHISPER_MODEL_PATH: './whisper.cpp/models/ggml-base.bin',
        
        // OpenRouter LLM
        LLM_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
        OPENROUTER_API_KEY: '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',
        
        // Output directories
        OUTPUT_DIR: './output',
        TEMP_DIR: './temp'
      },
      error_file: './logs/videotovtt-error.log',
      out_file: './logs/videotovtt-out.log',
      log_file: './logs/videotovtt-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 5,
      min_uptime: '10s',
      kill_timeout: 5000,
      restart_delay: 4000
    },
    {
      name: 'videotovtt-turbo',
      script: 'fast-processor.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        // Turbo Mode Configuration - First 10 videos for testing
        MAX_VIDEOS_TO_PROCESS: '10',
        MAX_CONCURRENT_VIDEOS: '5',
        TRANSLATION_BATCH_SIZE: '20',
        SKIP_EXISTING_VTTS: 'true',
        
        // API Configuration
        API_VIDEO_KEY: 'B6OEQoXryWfHgE9XRsxHGksPwSiyntyz7J30bQY3XkQ',
        UPLOAD_CAPTIONS: 'true',
        REPLACE_EXISTING_CAPTIONS: 'true',
        WHISPER_CPP_PATH: './whisper.cpp/main',
        WHISPER_MODEL_PATH: './whisper.cpp/models/ggml-base.bin',
        LLM_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
        OPENROUTER_API_KEY: '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',
        OUTPUT_DIR: './output',
        TEMP_DIR: './temp'
      },
      error_file: './logs/videotovtt-turbo-error.log',
      out_file: './logs/videotovtt-turbo-out.log',
      log_file: './logs/videotovtt-turbo-combined.log',
      time: true
    },
    {
      name: 'videotovtt-balanced',
      script: 'fast-processor.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1.5G',
      env: {
        NODE_ENV: 'production',
        // Balanced Mode - First 100 videos
        MAX_VIDEOS_TO_PROCESS: '100',
        MAX_CONCURRENT_VIDEOS: '3',
        TRANSLATION_BATCH_SIZE: '12',
        SKIP_EXISTING_VTTS: 'true',
        
        // API Configuration
        API_VIDEO_KEY: 'B6OEQoXryWfHgE9XRsxHGksPwSiyntyz7J30bQY3XkQ',
        UPLOAD_CAPTIONS: 'true',
        REPLACE_EXISTING_CAPTIONS: 'true',
        WHISPER_CPP_PATH: './whisper.cpp/main',
        WHISPER_MODEL_PATH: './whisper.cpp/models/ggml-base.bin',
        LLM_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
        OPENROUTER_API_KEY: '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',
        OUTPUT_DIR: './output',
        TEMP_DIR: './temp'
      },
      error_file: './logs/videotovtt-balanced-error.log',
      out_file: './logs/videotovtt-balanced-out.log',
      log_file: './logs/videotovtt-balanced-combined.log',
      time: true
    }
  ]
}; 
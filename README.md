# Video-to-VTT Processor

A Node.js application that automatically extracts speech from videos, generates VTT subtitle files, and translates them into multiple languages (Arabic, English, French).

## 🌟 Features

- **API Integration**: Authenticates with api.video API and fetches all videos with pagination support
- **Speech Extraction**: Uses FFmpeg to extract speech-only audio while reducing background music
- **Speech-to-Text**: Leverages whisper.cpp for accurate transcription
- **Language Detection**: Automatically detects the original language of the content
- **Multi-language Translation**: Supports translation to Arabic, English, and French using local LLMs
- **VTT Generation**: Creates properly formatted WebVTT subtitle files
- **Progress Tracking**: Real-time progress indication with colorful console output
- **Error Handling**: Robust error handling with graceful fallbacks

## 🛠️ Prerequisites

- **Node.js** (v16 or higher)
- **Git** (for cloning whisper.cpp)
- **Build tools** (make, gcc) for compiling whisper.cpp
- **FFmpeg** (optional but recommended for better performance)

### Platform-specific Requirements

**macOS:**
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install FFmpeg (optional)
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install build-essential git ffmpeg
```

**CentOS/RHEL:**
```bash
sudo yum groupinstall "Development Tools"
sudo yum install git ffmpeg
```

## 🚀 Quick Start

1. **Clone and Setup**
   ```bash
   git clone <your-repo-url>
   cd VideoToVTT
   chmod +x setup.sh
   ./setup.sh
   ```

2. **Configure Environment**
   ```bash
   # Copy and edit the environment file
   cp config.example.env .env
   # Edit .env with your settings
   ```

3. **Run the Application**
   ```bash
   npm start
   ```

## ⚙️ Configuration

Edit the `.env` file to customize your setup:

```env
# API Configuration
API_VIDEO_KEY=your_api_video_key_here

# Whisper.cpp Configuration
WHISPER_CPP_PATH=./whisper.cpp/main
WHISPER_MODEL_PATH=./whisper.cpp/models/ggml-medium.bin

# Local LLM Configuration (for DeepSeek/Mistral integration)
LLM_API_URL=http://localhost:11434/api/generate
LLM_MODEL=deepseek-r1:7b
LLM_API_KEY=your_llm_api_key_here

# Output Configuration
OUTPUT_DIR=./output
TEMP_DIR=./temp
```

## 🤖 LLM Integration

The application supports integration with local LLMs for translation:

### Ollama (Recommended)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull DeepSeek model
ollama pull deepseek-r1:7b

# Configure in .env
LLM_API_URL=http://localhost:11434/api/generate
LLM_MODEL=deepseek-r1:7b
```

### DeepSeek API
```bash
# Configure in .env
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
LLM_MODEL=deepseek-chat
LLM_API_KEY=your_deepseek_api_key
```

### Mistral API
```bash
# Configure in .env
LLM_API_URL=https://api.mistral.ai/v1/chat/completions
LLM_MODEL=mistral-small
LLM_API_KEY=your_mistral_api_key
```

## 📁 Output Structure

The application creates VTT files in the output directory:

```
output/
├── video_title_ar.vtt    # Arabic version
├── video_title_en.vtt    # English version
└── video_title_fr.vtt    # French version
```

## 🎵 Audio Processing

The application uses advanced FFmpeg filters to extract speech-only audio:

- **High-pass filter**: Removes low frequencies (bass/music)
- **Low-pass filter**: Removes high frequencies (noise)
- **Dynamic range compression**: Enhances speech clarity
- **Noise reduction**: Reduces background noise

## 🔧 Troubleshooting

### Common Issues

1. **whisper.cpp not found**
   ```bash
   ./setup.sh
   # or manually:
   git clone https://github.com/ggerganov/whisper.cpp.git
   cd whisper.cpp && make
   ```

2. **Model not found**
   ```bash
   cd whisper.cpp
   bash ./models/download-ggml-model.sh medium
   ```

3. **FFmpeg errors**
   ```bash
   # Install system FFmpeg for better performance
   # macOS:
   brew install ffmpeg
   # Ubuntu:
   sudo apt install ffmpeg
   ```

4. **LLM connection failed**
   - Check if your LLM service is running
   - Verify API URL and credentials in `.env`
   - The app will continue with placeholder translations if LLM is unavailable

### Memory Issues

For large videos or limited memory systems:

1. Use the base model instead of medium:
   ```env
   WHISPER_MODEL_PATH=./whisper.cpp/models/ggml-base.bin
   ```

2. Process videos in smaller batches by modifying the code to limit concurrent processing.

## 📊 Performance

- **Small model**: ~39 MB, fastest, least accurate
- **Base model**: ~142 MB, fast, good accuracy
- **Medium model**: ~769 MB, slower, better accuracy (recommended)
- **Large model**: ~1550 MB, slowest, best accuracy

## 🔒 Security

- API keys are stored in environment variables
- Temporary files are automatically cleaned up
- Video downloads are streamed to minimize disk usage

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## 📝 License

This project is licensed under the ISC License.

## 🆘 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Ensure all prerequisites are installed
3. Verify your environment configuration
4. Check the console output for detailed error messages

## 🔄 Workflow

1. **Authentication**: Connects to api.video using your API key
2. **Video Fetching**: Retrieves all videos with automatic pagination
3. **Download**: Downloads each video to temporary storage
4. **Audio Extraction**: Extracts speech-only audio using FFmpeg filters
5. **Transcription**: Uses whisper.cpp for speech-to-text conversion
6. **Language Detection**: Automatically detects the original language
7. **Translation**: Translates to other supported languages using LLM
8. **VTT Generation**: Creates properly formatted subtitle files
9. **Cleanup**: Removes temporary files to save disk space

The entire process is automated with progress tracking and error handling to ensure reliable operation. 
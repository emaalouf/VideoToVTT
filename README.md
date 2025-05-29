# Video-to-VTT Processor

A Node.js application that automatically extracts speech from videos, generates VTT subtitle files, and translates them into multiple languages (Arabic, English, French, Spanish, Italian).

## 🌟 Features

- **API Integration**: Authenticates with api.video API and fetches all videos with pagination support
- **Speech Extraction**: Uses FFmpeg to extract speech-only audio while reducing background music
- **Speech-to-Text**: Leverages whisper.cpp for accurate transcription
- **Language Detection**: Automatically detects the original language of the content
- **Multi-language Translation**: Supports translation to Arabic, English, French, Spanish, and Italian using local LLMs
- **VTT Generation**: Creates properly formatted WebVTT subtitle files
- **Caption Upload**: Automatically uploads generated captions back to api.video (optional)
- **Smart Caption Management**: Checks for existing captions and handles replacement automatically
- **Video Management**: Automated deletion of videos uploaded on specific dates (configurable)
- **Progress Tracking**: Real-time progress indication with colorful console output
- **Error Handling**: Robust error handling with graceful fallbacks

## 🛠️ Prerequisites

- **Node.js** (v16 or higher)
- **Git** (for cloning whisper.cpp)
- **Build tools** (make, gcc, cmake) for compiling whisper.cpp
- **FFmpeg** (optional but recommended for better performance)

### Platform-specific Requirements

**Ubuntu Server:**
```bash
# The ubuntu-setup.sh script will handle all dependencies automatically
# Just make sure you have root access or sudo privileges
```

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
sudo apt install build-essential git ffmpeg cmake nodejs npm
```

**CentOS/RHEL:**
```bash
sudo yum groupinstall "Development Tools"
sudo yum install git ffmpeg cmake nodejs npm
```

## 🚀 Quick Start

### For Ubuntu Server (Recommended)

1. **Clone and Setup Dependencies**
   ```bash
   git clone <your-repo-url>
   cd VideoToVTT
   
   # Run Ubuntu-specific setup (installs all system dependencies)
   chmod +x ubuntu-setup.sh
   sudo ./ubuntu-setup.sh
   
   # Run main setup (installs whisper.cpp and models)
   chmod +x setup.sh
   ./setup.sh
   ```

### For Other Platforms

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

# Caption Upload Configuration
UPLOAD_CAPTIONS=true
REPLACE_EXISTING_CAPTIONS=true

# Video Management Configuration
DELETE_MAY_29_VIDEOS=false

# Whisper.cpp Configuration
WHISPER_CPP_PATH=./whisper.cpp/main
WHISPER_MODEL_PATH=./whisper.cpp/models/ggml-base.bin

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
├── video_title_fr.vtt    # French version
├── video_title_es.vtt    # Spanish version
└── video_title_it.vtt    # Italian version
```

## 🎵 Audio Processing

The application uses advanced FFmpeg filters to extract speech-only audio:

- **High-pass filter**: Removes low frequencies (bass/music)
- **Low-pass filter**: Removes high frequencies (noise)
- **Dynamic range compression**: Enhances speech clarity
- **Noise reduction**: Reduces background noise

## 🔧 Troubleshooting

### Common Issues

1. **Ubuntu: cmake not found**
   ```bash
   # Run the Ubuntu setup script first
   sudo ./ubuntu-setup.sh
   ./setup.sh
   ```

2. **whisper.cpp not found**
   ```bash
   ./setup.sh
   # or manually:
   git clone https://github.com/ggerganov/whisper.cpp.git
   cd whisper.cpp && make
   ```

3. **Model not found**
   ```bash
   cd whisper.cpp
   bash ./models/download-ggml-model.sh medium
   ```

4. **FFmpeg errors**
   ```bash
   # Install system FFmpeg for better performance
   # macOS:
   brew install ffmpeg
   # Ubuntu:
   sudo apt install ffmpeg
   ```

5. **LLM connection failed**
   - Check if your LLM service is running
   - Verify API URL and credentials in `.env`
   - The app will continue with placeholder translations if LLM is unavailable

### Ubuntu Server Specific

If you encounter permission issues:
```bash
# Make sure scripts are executable
chmod +x ubuntu-setup.sh setup.sh

# Run with appropriate privileges
sudo ./ubuntu-setup.sh  # For system dependencies
./setup.sh              # For whisper.cpp and models
```

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

## 📤 Caption Upload Feature

The application can automatically upload generated VTT captions directly to your api.video account:

**Enable caption upload:**
```env
UPLOAD_CAPTIONS=true
```

**Disable caption upload (save files locally only):**
```env
UPLOAD_CAPTIONS=false
```

When enabled, the application will:
1. ✅ Generate VTT files locally (as backup)
2. ✅ Upload captions to api.video for each language (ar, en, fr, es, it)
3. ✅ Associate captions with the original videos
4. ✅ Make captions available in the api.video player

**API Endpoint Used:**
- `POST https://ws.api.video/videos/{videoId}/captions/{language}`
- Uploads VTT files with proper language codes
- Requires the same API key used for video fetching

## 🔄 Smart Caption Management

The application includes intelligent caption management to handle existing captions:

### Configuration Options

**Replace existing captions automatically:**
```env
REPLACE_EXISTING_CAPTIONS=true
```

**Skip videos that already have captions:**
```env
REPLACE_EXISTING_CAPTIONS=false
```

### How It Works

1. **Caption Check**: Before processing each video, the application checks for existing captions
2. **Decision Logic**:
   - If **no captions exist**: Proceeds with normal processing and upload
   - If **captions exist** and `REPLACE_EXISTING_CAPTIONS=true`: 
     - Deletes all existing captions
     - Waits for deletion to complete
     - Proceeds with new caption generation and upload
   - If **captions exist** and `REPLACE_EXISTING_CAPTIONS=false`:
     - Skips caption upload but still generates local VTT files
     - Logs a message about existing captions

### Features

- ✅ **Automatic Detection**: Checks all existing caption languages
- ✅ **Safe Deletion**: Waits for deletion completion before uploading new captions
- ✅ **Timeout Protection**: 30-second timeout prevents infinite waiting
- ✅ **Error Handling**: Graceful handling of deletion failures
- ✅ **Local Backup**: Always generates local VTT files regardless of upload status

### Example Output

```
🔍 Checking existing captions for video abc123...
⚠️  Found existing captions: en, fr
🔄 Replacing existing captions...
🗑️  Deleting all existing captions (en, fr)...
✅ EN caption deleted successfully
✅ FR caption deleted successfully
✅ All existing captions deleted successfully
⏳ Waiting for deletion to complete...
⏳ Verifying caption deletion completion...
✅ Caption deletion confirmed
📤 Uploading ar captions to api.video...
✅ AR captions uploaded successfully to video abc123
```

## 🗑️ Video Management & Deletion

The application includes functionality to automatically delete videos uploaded on specific dates during the fetching process.

### Configuration

**Enable deletion of videos uploaded on May 29th:**
```env
DELETE_MAY_29_VIDEOS=true
```

**Disable video deletion (default):**
```env
DELETE_MAY_29_VIDEOS=false
```

### How It Works

1. **Date Filtering**: After fetching all videos, checks each video's upload date
2. **Identification**: Finds videos uploaded on May 29th (any year)
3. **Safety Confirmation**: Shows a 5-second countdown before deletion starts
4. **Batch Deletion**: Deletes identified videos with progress tracking
5. **Array Cleanup**: Removes deleted videos from processing queue

### Safety Features

- ✅ **Date Validation**: Only targets videos uploaded exactly on May 29th
- ✅ **Confirmation Period**: 5-second warning before deletion starts
- ✅ **Progress Tracking**: Shows deletion progress and success/failure counts
- ✅ **Error Handling**: Continues processing even if some deletions fail
- ✅ **API Rate Limiting**: 500ms delay between deletions to be nice to the API
- ✅ **Configurable**: Can be completely disabled via environment variable

### Example Output

```
📹 Fetching videos from api.video...
✅ Total videos fetched: 150
🔍 Checking for videos uploaded on May 29th...
🚨 Found 3 videos uploaded on May 29th:
   - Test Video 1 (abc123) - Wed May 29 2024
   - Demo Content (def456) - Thu May 29 2025
   - Sample Upload (ghi789) - Tue May 29 2023
⚠️  DELETION WILL START IN 5 SECONDS...
   Press Ctrl+C to cancel if this was not intended!
🗑️  Starting deletion of May 29th videos...
🗑️  Deleting video: Test Video 1 (abc123)
✅ Video deleted successfully: Test Video 1
🗑️  Deleting video: Demo Content (def456)
✅ Video deleted successfully: Demo Content
🗑️  Deleting video: Sample Upload (ghi789)
✅ Video deleted successfully: Sample Upload
✅ Deletion complete: 3/3 videos deleted
📊 Remaining videos to process: 147
```

### ⚠️ Important Warning

**This feature permanently deletes videos from your api.video account!**

- Videos cannot be recovered after deletion
- Use with extreme caution in production environments
- Consider testing with `DELETE_MAY_29_VIDEOS=false` first
- The 5-second countdown allows you to cancel with Ctrl+C if needed

### API Endpoint Used

- `DELETE https://ws.api.video/videos/{videoId}`
- Requires the same API key used for video fetching
- Permanent deletion - videos cannot be restored

## 🔄 Smart Caption Management

The application includes intelligent caption management to handle existing captions:

### Configuration Options

**Replace existing captions automatically:**
```env
REPLACE_EXISTING_CAPTIONS=true
```

**Skip videos that already have captions:**
```env
REPLACE_EXISTING_CAPTIONS=false
```

### How It Works

1. **Caption Check**: Before processing each video, the application checks for existing captions
2. **Decision Logic**:
   - If **no captions exist**: Proceeds with normal processing and upload
   - If **captions exist** and `REPLACE_EXISTING_CAPTIONS=true`: 
     - Deletes all existing captions
     - Waits for deletion to complete
     - Proceeds with new caption generation and upload
   - If **captions exist** and `REPLACE_EXISTING_CAPTIONS=false`:
     - Skips caption upload but still generates local VTT files
     - Logs a message about existing captions

### Features

- ✅ **Automatic Detection**: Checks all existing caption languages
- ✅ **Safe Deletion**: Waits for deletion completion before uploading new captions
- ✅ **Timeout Protection**: 30-second timeout prevents infinite waiting
- ✅ **Error Handling**: Graceful handling of deletion failures
- ✅ **Local Backup**: Always generates local VTT files regardless of upload status

### Example Output

```
🔍 Checking existing captions for video abc123...
⚠️  Found existing captions: en, fr
🔄 Replacing existing captions...
🗑️  Deleting all existing captions (en, fr)...
✅ EN caption deleted successfully
✅ FR caption deleted successfully
✅ All existing captions deleted successfully
⏳ Waiting for deletion to complete...
⏳ Verifying caption deletion completion...
✅ Caption deletion confirmed
📤 Uploading ar captions to api.video...
✅ AR captions uploaded successfully to video abc123
``` 
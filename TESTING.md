# 🧪 VideoToVTT System Testing Guide

This guide will help you test all the new features including credit checking, dynamic model selection, and enhanced translation capabilities.

## 🚀 Quick Start Testing

### Option 1: Interactive Test Menu
```bash
./quick-test.sh
```

This will show you a menu with different testing options:
1. **Full System Test** - Tests all features comprehensively
2. **Quick Credit & Model Check** - Tests API connectivity and credits
3. **Translation Test Only** - Tests translation functionality
4. **Manual API Test** - Raw curl commands for debugging
5. **Single Video Test** - Process one video end-to-end
6. **Exit**

### Option 2: Comprehensive System Test
```bash
node test-system.js
```

This runs all tests automatically and provides a detailed report.

## 🔧 Prerequisites

### 1. Environment Setup
Make sure you have a `.env` file with your API key:
```bash
# Copy example config if .env doesn't exist
cp config.example.env .env

# Edit with your actual API key
nano .env
```

Your `.env` should contain:
```bash
OPENROUTER_API_KEY=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
```

### 2. Dependencies
```bash
npm install
```

### 3. Optional: Whisper.cpp (for full video processing)
```bash
./setup.sh
```

## 🧪 Test Categories

### 1. Credit & Model Testing
**What it tests:**
- ✅ API key validity
- ✅ Credit balance checking  
- ✅ Available models fetching
- ✅ Automatic model selection

**Expected output:**
```
💳 Checking OpenRouter credits...
✅ Credits Status:
   💰 Total Credits: 35
   📊 Used Credits: 29.3931
   🎯 Available Credits: 5.6069

🤖 Fetching available models...
✅ Found 150+ available models

🎯 Selected model: DeepSeek: Deepseek R1 0528 Qwen3 8B (free)
   📦 Model ID: deepseek/deepseek-r1-0528-qwen3-8b:free
   💰 Cost: FREE
   📏 Context: 131072 tokens
```

### 2. Translation Testing
**What it tests:**
- ✅ Text translation to multiple languages
- ✅ Quality of translations (no placeholders)
- ✅ API response handling
- ✅ Error handling

**Test phrases:**
- "Hello, world!"
- "Good morning, how are you today?"
- "The weather is beautiful outside."
- "Thank you for your help."

**Target languages:**
- French (fr)
- Spanish (es) 
- Arabic (ar)
- Italian (it)

### 3. VTT Translation Testing
**What it tests:**
- ✅ VTT file parsing
- ✅ Subtitle translation
- ✅ VTT format preservation
- ✅ Timestamp handling

### 4. System Integration Testing
**What it tests:**
- ✅ Full initialization process
- ✅ Connection testing
- ✅ Error handling and fallbacks
- ✅ Configuration loading

## 📊 Understanding Test Results

### ✅ Success Indicators
- **Real translations** (not placeholders like `[FR] Hello`)
- **Credit balance shown** (e.g., "5.6069 available")
- **Free model selected** (e.g., "deepseek/deepseek-r1-0528-qwen3-8b:free")
- **Token usage displayed** (e.g., "23 prompt + 5 completion = 28 total")

### ⚠️ Warning Signs
- **Placeholder translations** (e.g., `[FR] Hello, world!`)
- **Credit check failures** (API key issues)
- **Model selection fallbacks** (using hardcoded models)

### ❌ Failure Indicators
- **Authentication errors** (invalid API key)
- **Network timeouts** (connectivity issues)
- **Quota exceeded** (insufficient credits)

## 🔍 Manual Testing Commands

### Check Credits Directly
```bash
curl --location 'https://openrouter.ai/api/v1/credits' \
  --header 'Authorization: Bearer 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'
```

### List Free Models
```bash
curl -s 'https://openrouter.ai/api/v1/models' | \
  jq '.data[] | select(.pricing.prompt == "0" and .pricing.completion == "0") | .name'
```

### Test Translation
```bash
curl --location 'https://openrouter.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer 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' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "deepseek/deepseek-r1-0528-qwen3-8b:free",
    "messages": [
      {
        "role": "system",
        "content": "You are a professional translator. Translate the given text accurately while preserving the original meaning and tone. Return ONLY the translated text without any explanations."
      },
      {
        "role": "user", 
        "content": "Translate from English to French: Hello, world!"
      }
    ],
    "temperature": 0.2,
    "max_tokens": 1000
  }'
```

## 🎬 End-to-End Video Testing

### Single Video Test
```bash
./quick-test.sh
# Choose option 5
```

This will:
1. ✅ Check credits and select model
2. ✅ Authenticate with api.video
3. ✅ Fetch videos (process only the first one)
4. ✅ Download video
5. ✅ Extract speech-only audio
6. ✅ Transcribe with Whisper
7. ✅ Translate to 5 languages
8. ✅ Generate VTT files
9. ✅ Upload captions to api.video

### Full System Test (All Videos)
```bash
node index.js
```

⚠️ **Warning:** This will process ALL videos in your api.video account!

## 🛠️ Troubleshooting

### API Key Issues
```bash
# Check if API key is in .env
grep OPENROUTER_API_KEY .env

# Test API key manually
curl -H "Authorization: Bearer YOUR_KEY" https://openrouter.ai/api/v1/credits
```

### Credit Issues
- **Insufficient credits:** Use free models or add more credits
- **Rate limiting:** Add delays between requests
- **Quota exceeded:** Wait or upgrade plan

### Translation Issues
- **Placeholder text:** API connectivity or model issues
- **Wrong language:** Check language codes (ar, en, fr, es, it)
- **Empty responses:** Model overloaded, try different model

### Model Selection Issues
- **Fallback to expensive models:** Free models unavailable
- **Connection timeouts:** Network or API issues
- **Model not found:** Model IDs changed, update preferences

## 📈 Expected Performance

### With Free Models
- **Cost:** $0.00 per translation
- **Speed:** 2-5 seconds per subtitle
- **Quality:** Good for most use cases

### Credit Usage Estimation
- **Per subtitle:** ~0.0001-0.0005 credits
- **Per video (50 subtitles):** ~0.005-0.025 credits
- **Your 5.6 credits:** Can process 200-1000+ videos

## 🎯 Success Criteria

A successful test should show:
- ✅ Credit balance displayed
- ✅ Free model automatically selected
- ✅ Real translations (not placeholders)
- ✅ VTT files generated correctly
- ✅ Token usage tracking
- ✅ No API errors or timeouts

Your system is ready for production when all tests pass! 🚀 
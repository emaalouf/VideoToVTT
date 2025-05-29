#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import cliProgress from 'cli-progress';
import colors from 'colors';
import dotenv from 'dotenv';
import { LLMTranslator, detectTextLanguage } from './llm-translator.js';

dotenv.config();

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

const execAsync = promisify(exec);

class VideoToVTTProcessor {
  constructor() {
    this.apiKey = process.env.API_VIDEO_KEY || 'B6OEQoXryWfHgE9XRsxHGksPwSiyntyz7J30bQY3XkQ';
    this.baseURL = 'https://ws.api.video';
    this.accessToken = null;
    this.outputDir = process.env.OUTPUT_DIR || './output';
    this.tempDir = process.env.TEMP_DIR || './temp';
    this.whisperPath = process.env.WHISPER_CPP_PATH || './whisper.cpp/main';
    this.modelPath = process.env.WHISPER_MODEL_PATH || './whisper.cpp/models/ggml-medium.bin';
    
    // Initialize LLM translator
    this.translator = new LLMTranslator();
    this.llmAvailable = false;
    
    // Create directories
    fs.ensureDirSync(this.outputDir);
    fs.ensureDirSync(this.tempDir);
  }

  async initialize() {
    console.log(colors.rainbow('🚀 Initializing Video-to-VTT Processing...\n'));
    
    // Test LLM connection
    this.llmAvailable = await this.translator.testConnection();
    
    if (!this.llmAvailable) {
      console.log(colors.yellow('⚠️  Continuing with placeholder translations...'));
    }
  }

  async authenticate() {
    try {
      console.log(colors.blue('🔑 Authenticating with api.video...'));
      
      const response = await axios.post(`${this.baseURL}/auth/api-key`, {
        apiKey: this.apiKey
      }, {
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json'
        }
      });

      this.accessToken = response.data.access_token;
      console.log(colors.green('✅ Authentication successful!'));
      return this.accessToken;
    } catch (error) {
      console.error(colors.red('❌ Authentication failed:'), error.response?.data || error.message);
      throw error;
    }
  }

  async fetchAllVideos() {
    const allVideos = [];
    let currentPage = 1;
    let hasMorePages = true;

    console.log(colors.blue('📹 Fetching videos from api.video...'));

    while (hasMorePages) {
      try {
        const response = await axios.get(`${this.baseURL}/videos`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          },
          params: {
            currentPage,
            pageSize: 100
          }
        });

        const { data, pagination } = response.data;
        allVideos.push(...data);

        console.log(colors.cyan(`📄 Fetched page ${currentPage}/${pagination.pagesTotal} (${data.length} videos)`));

        hasMorePages = currentPage < pagination.pagesTotal;
        currentPage++;
      } catch (error) {
        console.error(colors.red('❌ Failed to fetch videos:'), error.response?.data || error.message);
        throw error;
      }
    }

    console.log(colors.green(`✅ Total videos fetched: ${allVideos.length}`));
    return allVideos;
  }

  async downloadVideo(video) {
    const videoUrl = video.assets.mp4;
    const filename = this.sanitizeFilename(video.title);
    const videoPath = path.join(this.tempDir, `${filename}.mp4`);

    console.log(colors.blue(`⬇️  Downloading: ${video.title}`));

    try {
      const response = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(videoPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(colors.green(`✅ Downloaded: ${filename}.mp4`));
      return videoPath;
    } catch (error) {
      console.error(colors.red(`❌ Failed to download ${video.title}:`), error.message);
      throw error;
    }
  }

  async extractSpeechOnlyAudio(videoPath, outputAudioPath) {
    console.log(colors.blue('🎵 Extracting speech-only audio...'));

    return new Promise((resolve, reject) => {
      // Use FFmpeg with audio filters to enhance speech and reduce music
      ffmpeg(videoPath)
        .audioFilters([
          'highpass=f=300',     // Remove low frequencies (reduces bass/music)
          'lowpass=f=3400',     // Remove high frequencies (reduces noise)
          'compand=attacks=0.3:decays=0.8:points=-80/-80|-45/-15|-27/-9|0/-7|20/-7', // Dynamic range compression for speech
          'afftdn=nf=-25'       // Noise reduction
        ])
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .format('wav')
        .output(outputAudioPath)
        .on('end', () => {
          console.log(colors.green('✅ Speech audio extracted successfully'));
          resolve();
        })
        .on('error', (err) => {
          console.error(colors.red('❌ Audio extraction failed:'), err.message);
          reject(err);
        })
        .run();
    });
  }

  async transcribeWithWhisper(audioPath, language = 'auto') {
    console.log(colors.blue(`🎙️  Transcribing audio with Whisper (${language})...`));

    try {
      // Check if whisper.cpp exists
      if (!fs.existsSync(this.whisperPath)) {
        throw new Error('whisper.cpp not found. Please run setup.sh to install whisper.cpp and set WHISPER_CPP_PATH environment variable.');
      }

      if (!fs.existsSync(this.modelPath)) {
        throw new Error('Whisper model not found. Please run setup.sh to download the model.');
      }

      // Generate output file path (without extension)
      const audioBasename = path.basename(audioPath, path.extname(audioPath));
      const outputPath = path.join(this.tempDir, audioBasename);

      const args = [
        '-m', this.modelPath,
        '-f', audioPath,
        '--output-vtt',
        '--language', language === 'auto' ? 'auto' : language,
        '-of', outputPath
      ];

      const command = `"${this.whisperPath}" ${args.join(' ')}`;
      console.log(colors.cyan(`🔧 Debug: Running command: ${command}`));

      const { stdout, stderr } = await execAsync(command);
      
      console.log(colors.cyan(`🔧 Debug: Whisper stdout: ${stdout}`));
      if (stderr) {
        console.log(colors.yellow(`🔧 Debug: Whisper stderr: ${stderr}`));
      }
      
      // The VTT file will be created as outputPath.vtt
      const vttPath = `${outputPath}.vtt`;
      
      console.log(colors.cyan(`🔧 Debug: Looking for VTT file at: ${vttPath}`));
      console.log(colors.cyan(`🔧 Debug: VTT file exists: ${fs.existsSync(vttPath)}`));
      
      // List all files in temp directory for debugging
      const tempFiles = fs.readdirSync(this.tempDir);
      console.log(colors.cyan(`🔧 Debug: Files in temp directory: ${tempFiles.join(', ')}`));

      if (fs.existsSync(vttPath)) {
        const vttContent = await fs.readFile(vttPath, 'utf8');
        console.log(colors.green('✅ Transcription completed'));
        return vttContent;
      } else {
        throw new Error('VTT file not generated by Whisper');
      }
    } catch (error) {
      console.error(colors.red('❌ Transcription failed:'), error.message);
      throw error;
    }
  }

  async translateVTT(vttContent, targetLanguage, sourceLanguage = 'auto') {
    if (this.llmAvailable) {
      return await this.translator.translateVTT(vttContent, targetLanguage, sourceLanguage);
    } else {
      // Use placeholder translation
      return this.createPlaceholderTranslation(vttContent, targetLanguage);
    }
  }

  createPlaceholderTranslation(vttContent, targetLanguage) {
    console.log(colors.yellow(`⚠️  Using placeholder translation for ${targetLanguage}`));
    
    const lines = vttContent.split('\n');
    const translatedLines = lines.map(line => {
      if (line.includes('-->') || line.startsWith('WEBVTT') || line.trim() === '') {
        return line; // Keep timestamp lines, headers, and empty lines unchanged
      }
      if (line.match(/^(align:|line:|position:|size:|vertical:)/)) {
        return line; // Keep cue settings unchanged
      }
      // Add translation indicator for subtitle text
      return `[${targetLanguage.toUpperCase()}] ${line}`;
    });
    
    return translatedLines.join('\n');
  }

  async processVideo(video) {
    const filename = this.sanitizeFilename(video.title);
    console.log(colors.magenta(`\n🎬 Processing video: ${video.title}`));

    try {
      // Download video
      const videoPath = await this.downloadVideo(video);

      // Extract speech-only audio
      const audioPath = path.join(this.tempDir, `${filename}_speech.wav`);
      await this.extractSpeechOnlyAudio(videoPath, audioPath);

      // Transcribe with Whisper
      const originalVtt = await this.transcribeWithWhisper(audioPath);

      // Detect language from the original VTT or video metadata
      const detectedLanguage = this.detectLanguage(originalVtt, video.title);
      
      // Save original VTT
      const originalLangCode = this.getLanguageCode(detectedLanguage);
      const originalVttPath = path.join(this.outputDir, `${filename}_${originalLangCode}.vtt`);
      await fs.writeFile(originalVttPath, originalVtt, 'utf8');
      console.log(colors.green(`✅ Saved original VTT: ${path.basename(originalVttPath)}`));

      // Translate to other languages
      const languages = ['ar', 'en', 'fr'];
      const targetLanguages = languages.filter(lang => lang !== originalLangCode);

      for (const targetLang of targetLanguages) {
        const translatedVtt = await this.translateVTT(originalVtt, targetLang, originalLangCode);
        const translatedVttPath = path.join(this.outputDir, `${filename}_${targetLang}.vtt`);
        await fs.writeFile(translatedVttPath, translatedVtt, 'utf8');
        console.log(colors.green(`✅ Saved translated VTT: ${path.basename(translatedVttPath)}`));
      }

      // Clean up temporary files
      await fs.remove(videoPath);
      await fs.remove(audioPath);

      console.log(colors.green(`✅ Completed processing: ${video.title}`));

    } catch (error) {
      console.error(colors.red(`❌ Failed to process ${video.title}:`), error.message);
    }
  }

  detectLanguage(vttContent, title) {
    // First try detecting from VTT content
    const detectedFromContent = detectTextLanguage(vttContent);
    if (detectedFromContent !== 'auto') {
      return this.getLanguageName(detectedFromContent);
    }

    // Fallback to title detection
    const detectedFromTitle = detectTextLanguage(title);
    if (detectedFromTitle !== 'auto') {
      return this.getLanguageName(detectedFromTitle);
    }

    // Default to English if detection fails
    return 'english';
  }

  getLanguageName(code) {
    const codeToName = {
      'ar': 'arabic',
      'en': 'english',
      'fr': 'french'
    };
    return codeToName[code] || 'english';
  }

  getLanguageCode(language) {
    const languageMap = {
      'arabic': 'ar',
      'english': 'en',
      'french': 'fr'
    };
    return languageMap[language] || 'en';
  }

  sanitizeFilename(filename) {
    return filename
      .replace(/[^\w\s\u0600-\u06FF-]/g, '') // Remove special characters except Arabic, hyphens and spaces
      .replace(/\s+/g, '_')     // Replace spaces with underscores
      .substring(0, 100);       // Limit length
  }

  async run() {
    try {
      // Initialize the application
      await this.initialize();

      // Authenticate
      await this.authenticate();

      // Fetch all videos
      const videos = await this.fetchAllVideos();

      if (videos.length === 0) {
        console.log(colors.yellow('⚠️  No videos found to process.'));
        return;
      }

      // Process videos with progress tracking
      const progressBar = new cliProgress.SingleBar({
        format: 'Progress |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Videos || Current: {filename}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      });

      progressBar.start(videos.length, 0, { filename: 'Starting...' });

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        progressBar.update(i, { filename: video.title.substring(0, 30) + '...' });
        
        await this.processVideo(video);
        
        progressBar.update(i + 1);
      }

      progressBar.stop();

      console.log(colors.rainbow('\n🎉 All videos processed successfully!'));
      console.log(colors.green(`📁 VTT files saved in: ${this.outputDir}`));

    } catch (error) {
      console.error(colors.red('\n❌ Application failed:'), error.message);
      process.exit(1);
    }
  }
}

// Run the application
const processor = new VideoToVTTProcessor();
processor.run().catch(console.error); 
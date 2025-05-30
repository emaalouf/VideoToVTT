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

class IndividualTranslationProcessor {
  constructor() {
    this.apiKey = process.env.API_VIDEO_KEY || 'B6OEQoXryWfHgE9XRsxHGksPwSiyntyz7J30bQY3XkQ';
    this.baseURL = 'https://ws.api.video';
    this.accessToken = null;
    this.tokenExpiry = null;
    this.outputDir = process.env.OUTPUT_DIR || './output';
    this.tempDir = process.env.TEMP_DIR || './temp';
    this.whisperPath = process.env.WHISPER_CPP_PATH || './whisper.cpp/main';
    this.modelPath = process.env.WHISPER_MODEL_PATH || './whisper.cpp/models/ggml-base.bin';
    
    // New approach settings
    this.whisperBatchSize = 25; // Process 25 videos at a time with Whisper
    this.whisperTimeout = 1800; // 30 minutes timeout for whisper batch
    this.maxConcurrentDownloads = 5; // Download 5 videos at once
    this.individualTranslations = true; // Translate one subtitle at a time
    this.skipExisting = process.env.SKIP_EXISTING_VTTS !== 'false';
    
    // Initialize LLM translator
    this.translator = new LLMTranslator();
    this.llmAvailable = false;
    
    // Tracking
    this.processingStats = {
      startTime: null,
      phase: 'initialization',
      videosDownloaded: 0,
      videosTranscribed: 0,
      videosTranslated: 0,
      videosUploaded: 0,
      totalVideos: 0
    };
    
    // Create directories
    fs.ensureDirSync(this.outputDir);
    fs.ensureDirSync(this.tempDir);
  }

  async initialize() {
    console.log(colors.rainbow('🚀 Initializing Individual Translation Processor...\n'));
    
    // Initialize LLM translator
    const llmInitialized = await this.translator.initialize();
    
    if (!llmInitialized) {
      console.error(colors.red('❌ LLM translator initialization failed'));
      throw new Error('LLM translator is required');
    }
    
    // Test LLM connection
    this.llmAvailable = await this.translator.testConnection();
    
    if (!this.llmAvailable) {
      console.error(colors.red('❌ LLM translator connection test failed'));
      throw new Error('LLM translator must be working');
    }

    console.log(colors.green('✅ LLM translator verified and ready'));
    console.log(colors.cyan(`📋 New Processing Approach:`));
    console.log(colors.cyan(`   📥 Download all videos first`));
    console.log(colors.cyan(`   🎤 Whisper batch size: ${this.whisperBatchSize} videos`));
    console.log(colors.cyan(`   ⏱️  Whisper timeout: ${this.whisperTimeout}s (30 min)`));
    console.log(colors.cyan(`   🔄 Individual subtitle translations`));
    console.log(colors.cyan(`   🔗 Max concurrent downloads: ${this.maxConcurrentDownloads}`));
  }

  async authenticate() {
    try {
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return;
      }

      const response = await axios.post(`${this.baseURL}/auth/api-key`, {
        apiKey: this.apiKey
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minute buffer
      console.log(colors.green('✅ Authenticated with api.video'));
    } catch (error) {
      console.error(colors.red('❌ Authentication failed:'), error.response?.data || error.message);
      throw error;
    }
  }

  async ensureValidToken() {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  async getAllVideos() {
    await this.ensureValidToken();

    try {
      console.log(colors.blue('📋 Fetching all videos from api.video...'));
      
      let allVideos = [];
      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const response = await axios.get(`${this.baseURL}/videos`, {
          headers: { 'Authorization': `Bearer ${this.accessToken}` },
          params: { currentPage, pageSize: 100 }
        });

        const { data, pagination } = response.data;
        allVideos.push(...data);

        hasMorePages = pagination.currentPage < pagination.pagesTotal;
        currentPage++;
        
        console.log(colors.cyan(`   📄 Page ${pagination.currentPage}/${pagination.pagesTotal}: ${data.length} videos`));
      }

      console.log(colors.green(`✅ Found ${allVideos.length} total videos`));
      return allVideos;
    } catch (error) {
      console.error(colors.red('❌ Failed to fetch videos:'), error.response?.data || error.message);
      throw error;
    }
  }

  // PHASE 1: Download all videos
  async downloadAllVideos(videos) {
    console.log(colors.rainbow('\n🎯 PHASE 1: DOWNLOADING ALL VIDEOS'));
    console.log(colors.rainbow('=' .repeat(50)));
    
    this.processingStats.phase = 'downloading';
    this.processingStats.totalVideos = videos.length;
    
    const downloadPromises = [];
    const semaphore = new Array(this.maxConcurrentDownloads).fill(null);
    let downloadIndex = 0;
    const results = [];
    
    const downloadNext = async (slotIndex) => {
      while (downloadIndex < videos.length) {
        const videoIndex = downloadIndex++;
        const video = videos[videoIndex];
        const filename = this.sanitizeFilename(video.title);
        const videoPath = path.join(this.tempDir, `${filename}.mp4`);
        
        try {
          // Skip if already downloaded
          if (fs.existsSync(videoPath)) {
            console.log(colors.yellow(`⏭️  Already downloaded: ${video.title}`));
            results.push({ video, success: true, path: videoPath });
            this.processingStats.videosDownloaded++;
            continue;
          }
          
          console.log(colors.cyan(`📥 Downloading: ${video.title}`));
          
          const response = await axios({
            method: 'GET',
            url: video.assets.mp4,
            responseType: 'stream',
            timeout: 300000 // 5 minute timeout per download
          });
          
          const writer = fs.createWriteStream(videoPath);
          response.data.pipe(writer);
          
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
          
          console.log(colors.green(`✅ Downloaded: ${video.title}`));
          results.push({ video, success: true, path: videoPath });
          this.processingStats.videosDownloaded++;
          
        } catch (error) {
          console.error(colors.red(`❌ Download failed for ${video.title}:`, error.message));
          results.push({ video, success: false, error: error.message });
        }
      }
    };
    
    // Start concurrent downloads
    for (let i = 0; i < Math.min(this.maxConcurrentDownloads, videos.length); i++) {
      semaphore[i] = downloadNext(i);
    }
    
    // Wait for all downloads
    await Promise.all(semaphore);
    
    const successful = results.filter(r => r.success);
    console.log(colors.green(`\n✅ Downloaded ${successful.length}/${videos.length} videos`));
    return successful;
  }

  // PHASE 2: Process with Whisper in batches
  async transcribeWithWhisperBatches(downloadedVideos) {
    console.log(colors.rainbow('\n🎯 PHASE 2: TRANSCRIBING WITH WHISPER (BATCHES)'));
    console.log(colors.rainbow('=' .repeat(50)));
    
    this.processingStats.phase = 'transcribing';
    const transcriptionResults = [];
    
    for (let i = 0; i < downloadedVideos.length; i += this.whisperBatchSize) {
      const batch = downloadedVideos.slice(i, i + this.whisperBatchSize);
      const batchNumber = Math.floor(i / this.whisperBatchSize) + 1;
      const totalBatches = Math.ceil(downloadedVideos.length / this.whisperBatchSize);
      
      console.log(colors.cyan(`\n🎤 Processing Whisper Batch ${batchNumber}/${totalBatches} (${batch.length} videos)`));
      
      const batchResults = await this.processBatchWithWhisper(batch, batchNumber);
      transcriptionResults.push(...batchResults);
      
      // Small delay between batches
      if (i + this.whisperBatchSize < downloadedVideos.length) {
        console.log(colors.gray('⏸️  Brief pause between batches...'));
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const successful = transcriptionResults.filter(r => r.success);
    console.log(colors.green(`\n✅ Transcribed ${successful.length}/${downloadedVideos.length} videos`));
    return successful;
  }

  async processBatchWithWhisper(batch, batchNumber) {
    const results = [];
    
    for (const item of batch) {
      const { video, path: videoPath } = item;
      const filename = this.sanitizeFilename(video.title);
      const audioPath = path.join(this.tempDir, `${filename}.wav`);
      const vttPath = path.join(this.outputDir, `${filename}.vtt`);
      
      try {
        // Skip if VTT already exists
        if (fs.existsSync(vttPath)) {
          console.log(colors.yellow(`⏭️  VTT exists: ${video.title}`));
          const vttContent = fs.readFileSync(vttPath, 'utf8');
          results.push({ video, success: true, vttContent, vttPath });
          this.processingStats.videosTranscribed++;
          continue;
        }
        
        console.log(colors.blue(`🎤 Transcribing: ${video.title}`));
        
        // Extract audio
        await new Promise((resolve, reject) => {
          ffmpeg(videoPath)
            .toFormat('wav')
            .audioFrequency(16000)
            .audioChannels(1)
            .save(audioPath)
            .on('end', resolve)
            .on('error', reject);
        });
        
        // Run Whisper with extended timeout
        const whisperCommand = `"${this.whisperPath}" -m "${this.modelPath}" -f "${audioPath}" -ovtt -of "${vttPath}"`;
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Whisper timeout after ${this.whisperTimeout}s`));
          }, this.whisperTimeout * 1000);
          
          exec(whisperCommand, { timeout: this.whisperTimeout * 1000 }, (error, stdout, stderr) => {
            clearTimeout(timeout);
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
        
        // Read and validate VTT
        if (!fs.existsSync(vttPath)) {
          throw new Error('Whisper did not generate VTT file');
        }
        
        const vttContent = fs.readFileSync(vttPath, 'utf8');
        if (!vttContent.includes('WEBVTT')) {
          throw new Error('Invalid VTT content generated');
        }
        
        // Cleanup audio file
        fs.removeSync(audioPath);
        
        console.log(colors.green(`✅ Transcribed: ${video.title}`));
        results.push({ video, success: true, vttContent, vttPath });
        this.processingStats.videosTranscribed++;
        
      } catch (error) {
        console.error(colors.red(`❌ Transcription failed for ${video.title}:`, error.message));
        results.push({ video, success: false, error: error.message });
        
        // Cleanup on error
        [audioPath, vttPath].forEach(file => {
          if (fs.existsSync(file)) fs.removeSync(file);
        });
      }
    }
    
    return results;
  }

  // PHASE 3: Individual translations
  async translateIndividually(transcribedVideos) {
    console.log(colors.rainbow('\n🎯 PHASE 3: INDIVIDUAL SUBTITLE TRANSLATIONS'));
    console.log(colors.rainbow('=' .repeat(50)));
    
    this.processingStats.phase = 'translating';
    const languages = ['ar', 'fr', 'es', 'it']; // Skip 'en' as it's the source
    const results = [];
    
    for (const item of transcribedVideos) {
      const { video, vttContent, vttPath } = item;
      const filename = this.sanitizeFilename(video.title);
      
      console.log(colors.cyan(`\n🌐 Translating: ${video.title}`));
      
      const videoResults = { video, translations: {} };
      
      for (const lang of languages) {
        try {
          const translatedVTT = await this.translateVTTIndividually(vttContent, lang);
          const translatedPath = path.join(this.outputDir, `${filename}_${lang}.vtt`);
          
          fs.writeFileSync(translatedPath, translatedVTT);
          videoResults.translations[lang] = { success: true, path: translatedPath };
          
          console.log(colors.green(`   ✅ ${lang.toUpperCase()} translation completed`));
          
          // Small delay between languages
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(colors.red(`   ❌ ${lang.toUpperCase()} translation failed:`, error.message));
          videoResults.translations[lang] = { success: false, error: error.message };
        }
      }
      
      results.push(videoResults);
      this.processingStats.videosTranslated++;
    }
    
    console.log(colors.green(`\n✅ Translated ${results.length} videos`));
    return results;
  }

  // Individual subtitle translation (one at a time)
  async translateVTTIndividually(vttContent, targetLanguage) {
    console.log(colors.blue(`   🔄 Translating subtitles to ${targetLanguage.toUpperCase()}...`));
    
    const vttLines = vttContent.split('\n');
    const translatedLines = [];
    let subtitleCount = 0;
    
    for (let i = 0; i < vttLines.length; i++) {
      const line = vttLines[i].trim();
      
      // Skip WEBVTT header, empty lines, timestamps, and cue settings
      if (line.startsWith('WEBVTT') || line === '' || line.includes('-->') || 
          line.match(/^(align:|line:|position:|size:|vertical:)/)) {
        translatedLines.push(line);
        continue;
      }
      
      // This is subtitle text - translate individually
      if (line !== '') {
        subtitleCount++;
        
        try {
          // Individual translation with retry
          const translatedText = await this.retryTranslation(async () => {
            return await this.translator.translateText(line, targetLanguage, 'en');
          }, `subtitle ${subtitleCount}`, 3);
          
          // Validate translation
          if (translatedText === line || translatedText.includes(`[${targetLanguage.toUpperCase()}]`)) {
            throw new Error(`Invalid translation for: "${line}"`);
          }
          
          translatedLines.push(translatedText);
          
          // Small delay between individual translations
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          console.error(colors.red(`     ❌ Failed to translate: "${line}"`));
          throw error;
        }
      } else {
        translatedLines.push(line);
      }
    }
    
    console.log(colors.cyan(`   📝 Translated ${subtitleCount} subtitles to ${targetLanguage.toUpperCase()}`));
    return translatedLines.join('\n');
  }

  // PHASE 4: Upload all captions
  async uploadAllCaptions(translationResults) {
    console.log(colors.rainbow('\n🎯 PHASE 4: UPLOADING ALL CAPTIONS'));
    console.log(colors.rainbow('=' .repeat(50)));
    
    this.processingStats.phase = 'uploading';
    
    for (const result of translationResults) {
      const { video, translations } = result;
      console.log(colors.cyan(`\n📤 Uploading captions for: ${video.title}`));
      
      // Upload English VTT first
      const filename = this.sanitizeFilename(video.title);
      const englishVTT = path.join(this.outputDir, `${filename}.vtt`);
      
      if (fs.existsSync(englishVTT)) {
        await this.uploadCaption(video.videoId, englishVTT, 'en');
      }
      
      // Upload translations
      for (const [lang, translation] of Object.entries(translations)) {
        if (translation.success) {
          await this.uploadCaption(video.videoId, translation.path, lang);
        }
      }
      
      this.processingStats.videosUploaded++;
    }
    
    console.log(colors.green(`\n✅ Uploaded captions for ${this.processingStats.videosUploaded} videos`));
  }

  async uploadCaption(videoId, vttPath, language) {
    try {
      await this.ensureValidToken();
      
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('file', fs.createReadStream(vttPath));
      
      await axios.post(
        `${this.baseURL}/videos/${videoId}/captions/${language}`,
        form,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            ...form.getHeaders()
          }
        }
      );
      
      console.log(colors.green(`   ✅ Uploaded ${language.toUpperCase()} caption`));
      
    } catch (error) {
      console.error(colors.red(`   ❌ Failed to upload ${language.toUpperCase()} caption:`, error.message));
    }
  }

  // Utility methods
  async retryTranslation(operation, context, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const waitTime = attempt * 2000; // 2s, 4s, 6s
          console.log(colors.yellow(`     ⚠️  Retrying ${context} (${attempt}/${maxRetries}) in ${waitTime/1000}s...`));
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    throw lastError;
  }

  sanitizeFilename(filename) {
    return filename
      .replace(/[^\w\s\u0600-\u06FF-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  // Main processing function
  async processAllVideos() {
    console.log(colors.rainbow('🚀 STARTING COMPREHENSIVE VIDEO PROCESSING\n'));
    
    this.processingStats.startTime = Date.now();
    
    try {
      // Get all videos
      const allVideos = await this.getAllVideos();
      
      // PHASE 1: Download all videos
      const downloadedVideos = await this.downloadAllVideos(allVideos);
      
      // PHASE 2: Transcribe with Whisper in batches
      const transcribedVideos = await this.transcribeWithWhisperBatches(downloadedVideos);
      
      // PHASE 3: Individual translations
      const translationResults = await this.translateIndividually(transcribedVideos);
      
      // PHASE 4: Upload all captions
      await this.uploadAllCaptions(translationResults);
      
      // Final summary
      const totalTime = Date.now() - this.processingStats.startTime;
      console.log(colors.rainbow('\n🎉 PROCESSING COMPLETED!'));
      console.log(colors.rainbow('=' .repeat(50)));
      console.log(colors.green(`✅ Videos Downloaded: ${this.processingStats.videosDownloaded}`));
      console.log(colors.green(`✅ Videos Transcribed: ${this.processingStats.videosTranscribed}`));
      console.log(colors.green(`✅ Videos Translated: ${this.processingStats.videosTranslated}`));
      console.log(colors.green(`✅ Videos Uploaded: ${this.processingStats.videosUploaded}`));
      console.log(colors.cyan(`⏱️  Total Time: ${this.formatDuration(totalTime)}`));
      
    } catch (error) {
      console.error(colors.red('❌ Processing failed:'), error.message);
      throw error;
    }
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Main execution
async function main() {
  const processor = new IndividualTranslationProcessor();
  
  try {
    await processor.initialize();
    await processor.processAllVideos();
  } catch (error) {
    console.error(colors.red('❌ Fatal error:'), error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { IndividualTranslationProcessor }; 
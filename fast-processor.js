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

class FastVideoToVTTProcessor {
  constructor() {
    this.apiKey = process.env.API_VIDEO_KEY || 'B6OEQoXryWfHgE9XRsxHGksPwSiyntyz7J30bQY3XkQ';
    this.baseURL = 'https://ws.api.video';
    this.accessToken = null;
    this.tokenExpiry = null;
    this.outputDir = process.env.OUTPUT_DIR || './output';
    this.tempDir = process.env.TEMP_DIR || './temp';
    this.whisperPath = process.env.WHISPER_CPP_PATH || './whisper.cpp/main';
    this.modelPath = process.env.WHISPER_MODEL_PATH || './whisper.cpp/models/ggml-base.bin';
    
    // Performance settings - AGGRESSIVE for paid models
    this.maxConcurrentVideos = parseInt(process.env.MAX_CONCURRENT_VIDEOS) || 3; // Back to 3
    this.maxConcurrentTranslations = parseInt(process.env.MAX_CONCURRENT_TRANSLATIONS) || 5; // Back to 5
    this.batchSize = parseInt(process.env.TRANSLATION_BATCH_SIZE) || 15; // Increased to 15 for paid models
    this.skipExisting = process.env.SKIP_EXISTING_VTTS !== 'false';
    
    // Initialize LLM translator
    this.translator = new LLMTranslator();
    
    // Override model selection for paid model if specified
    if (process.env.FORCE_PAID_MODEL) {
      console.log(colors.yellow(`🚀 Forcing paid model: ${process.env.FORCE_PAID_MODEL}`));
      this.translator.selectedModel = process.env.FORCE_PAID_MODEL;
    }
    
    this.llmAvailable = false;
    
    // Time tracking and estimation
    this.processingStats = {
      startTime: null,
      videosProcessed: 0,
      totalVideos: 0,
      phaseAverages: {
        download: { total: 0, count: 0, avg: 0 },
        transcription: { total: 0, count: 0, avg: 0 },
        translation: { total: 0, count: 0, avg: 0 },
        upload: { total: 0, count: 0, avg: 0 },
        overall: { total: 0, count: 0, avg: 0 }
      },
      currentVideoStart: null,
      currentVideoTitle: '',
      lastProgressUpdate: Date.now()
    };
    
    // Create directories
    fs.ensureDirSync(this.outputDir);
    fs.ensureDirSync(this.tempDir);
  }

  // Update phase timing statistics
  updatePhaseStats(phase, duration) {
    const stats = this.processingStats.phaseAverages[phase];
    stats.total += duration;
    stats.count += 1;
    stats.avg = stats.total / stats.count;
    
    console.log(colors.gray(`   ⏱️  ${phase}: ${(duration/1000).toFixed(1)}s (avg: ${(stats.avg/1000).toFixed(1)}s)`));
  }

  // Calculate estimated time for remaining videos
  calculateETAs() {
    const now = Date.now();
    const elapsed = now - this.processingStats.startTime;
    const processed = this.processingStats.videosProcessed;
    const remaining = this.processingStats.totalVideos - processed;
    
    if (processed === 0) {
      return {
        currentVideoETA: 'Calculating...',
        overallETA: 'Calculating...',
        overallProgress: 0
      };
    }
    
    // Current video ETA (based on phase averages)
    const overallAvg = this.processingStats.phaseAverages.overall.avg;
    const currentVideoElapsed = this.processingStats.currentVideoStart ? 
      now - this.processingStats.currentVideoStart : 0;
    const currentVideoETA = overallAvg > 0 ? 
      Math.max(0, overallAvg - currentVideoElapsed) : currentVideoElapsed;
    
    // Overall ETA (based on current processing rate with concurrency)
    const avgPerVideo = elapsed / processed;
    const remainingTime = (remaining * avgPerVideo) / this.maxConcurrentVideos; // Account for concurrency
    
    // Progress percentage
    const overallProgress = Math.round((processed / this.processingStats.totalVideos) * 100);
    
    return {
      currentVideoETA: this.formatDuration(currentVideoETA),
      overallETA: this.formatDuration(remainingTime),
      overallProgress: overallProgress,
      avgPerVideo: this.formatDuration(avgPerVideo),
      totalElapsed: this.formatDuration(elapsed)
    };
  }

  // Format duration in human-readable format
  formatDuration(ms) {
    if (!ms || ms < 0) return '0s';
    
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

  // Display progress and ETA information
  displayProgressUpdate(videoTitle = null) {
    const now = Date.now();
    
    // Only update every 30 seconds to avoid spam
    if (now - this.processingStats.lastProgressUpdate < 30000) {
      return;
    }
    
    this.processingStats.lastProgressUpdate = now;
    
    const etas = this.calculateETAs();
    
    console.log(colors.rainbow('\n📊 PROCESSING PROGRESS UPDATE'));
    console.log(colors.rainbow('=' .repeat(40)));
    console.log(colors.cyan(`📈 Overall Progress: ${etas.overallProgress}% (${this.processingStats.videosProcessed}/${this.processingStats.totalVideos})`));
    console.log(colors.cyan(`⏱️  Total Elapsed: ${etas.totalElapsed}`));
    console.log(colors.cyan(`🎯 Overall ETA: ${etas.overallETA}`));
    console.log(colors.cyan(`📊 Avg per Video: ${etas.avgPerVideo}`));
    
    if (videoTitle) {
      console.log(colors.yellow(`🎬 Current: ${videoTitle}`));
      console.log(colors.yellow(`🔮 Current Video ETA: ${etas.currentVideoETA}`));
    }
    
    // Show phase performance
    console.log(colors.gray('\n⏱️  Phase Averages:'));
    Object.entries(this.processingStats.phaseAverages).forEach(([phase, stats]) => {
      if (stats.count > 0) {
        console.log(colors.gray(`   ${phase}: ${(stats.avg/1000).toFixed(1)}s (${stats.count} samples)`));
      }
    });
    
    console.log(colors.rainbow('=' .repeat(40) + '\n'));
  }

  async initialize() {
    console.log(colors.rainbow('🚀 Initializing FAST Video-to-VTT Processing...\n'));
    
    // Initialize LLM translator with credits check and model selection
    const llmInitialized = await this.translator.initialize();
    
    if (!llmInitialized) {
      console.error(colors.red('❌ LLM translator initialization failed'));
      throw new Error('LLM translator is required - no fallback translations accepted');
    }
    
    // Test LLM connection
    this.llmAvailable = await this.translator.testConnection();
    
    if (!this.llmAvailable) {
      console.error(colors.red('❌ LLM translator connection test failed'));
      throw new Error('LLM translator must be working - no placeholder translations accepted');
    }

    console.log(colors.green('✅ LLM translator verified and ready'));

    console.log(colors.cyan(`🏃‍♂️ Performance Settings:`));
    console.log(colors.cyan(`   📹 Max Concurrent Videos: ${this.maxConcurrentVideos}`));
    console.log(colors.cyan(`   🌐 Max Concurrent Translations: ${this.maxConcurrentTranslations}`));
    console.log(colors.cyan(`   📦 Translation Batch Size: ${this.batchSize}`));
    console.log(colors.cyan(`   ⏭️  Skip Existing VTTs: ${this.skipExisting}`));
    console.log(colors.cyan(`   🚫 Translation Fallbacks: DISABLED (strict mode)`));
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
      this.tokenExpiry = Date.now() + (50 * 60 * 1000); // Refresh every 50 minutes (tokens last 1 hour)
      console.log(colors.green('✅ Authentication successful!'));
      return this.accessToken;
    } catch (error) {
      console.error(colors.red('❌ Authentication failed:'), error.response?.data || error.message);
      throw error;
    }
  }

  async ensureValidToken() {
    // Check if token is expired or will expire in the next 5 minutes
    if (!this.accessToken || !this.tokenExpiry || Date.now() > (this.tokenExpiry - 5 * 60 * 1000)) {
      console.log(colors.yellow('🔄 Refreshing expired API.video token...'));
      await this.authenticate();
    }
    return this.accessToken;
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

  // Filter videos to process based on various criteria
  filterVideosToProcess(videos) {
    let filteredVideos = videos;

    // Skip videos that already have VTT files
    if (this.skipExisting) {
      filteredVideos = filteredVideos.filter(video => {
        const filename = this.sanitizeFilename(video.title);
        const languages = ['ar', 'en', 'fr', 'es', 'it'];
        
        // Check if all language VTT files already exist
        const allExist = languages.every(lang => {
          const vttPath = path.join(this.outputDir, `${filename}_${lang}.vtt`);
          return fs.existsSync(vttPath);
        });
        
        if (allExist) {
          console.log(colors.yellow(`⏭️  Skipping ${video.title} (VTT files already exist)`));
          return false;
        }
        return true;
      });
    }

    // Optional: Filter by date (last N days)
    const processDays = process.env.PROCESS_LAST_N_DAYS;
    if (processDays) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(processDays));
      
      filteredVideos = filteredVideos.filter(video => {
        const videoDate = new Date(video.publishedAt || video.createdAt);
        return videoDate >= daysAgo;
      });
      
      console.log(colors.cyan(`📅 Filtered to videos from last ${processDays} days: ${filteredVideos.length} videos`));
    }

    // Optional: Limit total number of videos to process
    const maxVideos = process.env.MAX_VIDEOS_TO_PROCESS;
    if (maxVideos) {
      filteredVideos = filteredVideos.slice(0, parseInt(maxVideos));
      console.log(colors.cyan(`🔢 Limited to first ${maxVideos} videos: ${filteredVideos.length} videos`));
    }

    console.log(colors.green(`🎯 Final videos to process: ${filteredVideos.length}`));
    return filteredVideos;
  }

  // Batch translate multiple subtitles at once
  async batchTranslateSubtitles(subtitles, targetLanguage, sourceLanguage = 'auto') {
    if (!this.llmAvailable) {
      throw new Error(`LLM translator not available - cannot translate to ${targetLanguage.toUpperCase()}`);
    }

    try {
      // Create a batch prompt with multiple subtitles
      const batchPrompt = `Translate the following subtitles from ${sourceLanguage} to ${this.getLanguageName(targetLanguage)}. 
Return ONLY the translations, one per line, in the same order. Do not add explanations or numbering.

Subtitles to translate:
${subtitles.map((subtitle, index) => `${index + 1}. ${subtitle}`).join('\n')}

Translations:`;

      console.log(colors.blue(`🔄 Batch translating ${subtitles.length} subtitles to ${targetLanguage.toUpperCase()}...`));
      
      // Use retry wrapper for OpenRouter API call
      const response = await this.retryWithBackoff(async () => {
        return await this.translator.translateWithOpenRouter(batchPrompt);
      }, `Batch translation to ${targetLanguage.toUpperCase()}`);
      
      // Parse the response into individual translations
      const translations = response.split('\n')
        .map(line => line.replace(/^\d+\.\s*/, '').trim()) // Remove numbering if present
        .filter(line => line.length > 0)
        .slice(0, subtitles.length); // Ensure we don't get extra lines

      // Strict validation - must have exactly the right number of translations
      if (translations.length < subtitles.length) {
        throw new Error(`Translation incomplete: got ${translations.length} translations for ${subtitles.length} subtitles`);
      }

      // Validate translations are not just placeholders or copies
      for (let i = 0; i < translations.length; i++) {
        const translation = translations[i];
        const original = subtitles[i];
        
        // Check for placeholder patterns
        if (translation.includes(`[${targetLanguage.toUpperCase()}]`) || 
            translation === original ||
            translation.toLowerCase().includes('placeholder') ||
            translation.toLowerCase().includes('translation') ||
            translation.length < 3) {
          throw new Error(`Invalid translation detected for "${original}" -> "${translation}"`);
        }
      }

      console.log(colors.green(`✅ Batch translated ${translations.length} subtitles to ${targetLanguage.toUpperCase()}`));
      return translations;

    } catch (error) {
      console.error(colors.red(`❌ Batch translation failed for ${targetLanguage}:`, error.message));
      // NO FALLBACK - throw the error to fail processing
      throw error;
    }
  }

  // Process multiple videos concurrently
  async processVideosConcurrently(videos) {
    const results = [];
    const errors = [];
    
    // Initialize timing stats
    this.processingStats.startTime = Date.now();
    this.processingStats.totalVideos = videos.length;
    this.processingStats.videosProcessed = 0;
    
    console.log(colors.cyan(`🎯 Starting processing of ${videos.length} videos with time estimation...`));
    
    // Create progress bar
    const progressBar = new cliProgress.SingleBar({
      format: 'Progress |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Videos || ETA: {eta}s || Active: {active}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(videos.length, 0, { active: 'Starting...', eta: 'Calculating...' });

    const semaphore = new Array(this.maxConcurrentVideos).fill(null);
    let completed = 0;
    let started = 0;

    const processNext = async (index) => {
      if (started >= videos.length) return;
      
      const videoIndex = started++;
      const video = videos[videoIndex];
      const videoStartTime = Date.now();
      
      try {
        // Update current video tracking
        this.processingStats.currentVideoStart = videoStartTime;
        this.processingStats.currentVideoTitle = video.title;
        
        // Update progress bar with ETA
        const etas = this.calculateETAs();
        progressBar.update(completed, { 
          active: `${this.maxConcurrentVideos - semaphore.filter(s => s === null).length} active`,
          eta: etas.overallETA
        });
        
        // Process the video with timing
        await this.processVideoFast(video);
        
        // Update timing stats
        const videoDuration = Date.now() - videoStartTime;
        this.updatePhaseStats('overall', videoDuration);
        this.processingStats.videosProcessed++;
        
        results.push({ video, success: true, duration: videoDuration });
        
        // Display periodic progress updates
        this.displayProgressUpdate();
        
      } catch (error) {
        console.error(colors.red(`❌ Failed to process ${video.title}:`), error.message);
        const videoDuration = Date.now() - videoStartTime;
        errors.push({ video, error: error.message, duration: videoDuration });
      } finally {
        completed++;
        const etas = this.calculateETAs();
        progressBar.update(completed, { eta: etas.overallETA });
        semaphore[index] = null;
        
        // Start next video
        if (started < videos.length) {
          semaphore[index] = processNext(index);
        }
      }
    };

    // Start initial batch
    for (let i = 0; i < Math.min(this.maxConcurrentVideos, videos.length); i++) {
      semaphore[i] = processNext(i);
    }

    // Wait for all videos to complete
    await Promise.all(semaphore.filter(p => p !== null));
    
    progressBar.stop();

    // Final summary with timing
    const totalDuration = Date.now() - this.processingStats.startTime;
    const avgPerVideo = totalDuration / videos.length;
    
    console.log(colors.rainbow('\n📊 FINAL PROCESSING SUMMARY'));
    console.log(colors.rainbow('=' .repeat(50)));
    console.log(colors.green(`✅ Successful: ${results.length}`));
    console.log(colors.red(`❌ Failed: ${errors.length}`));
    console.log(colors.cyan(`⏱️  Total Time: ${this.formatDuration(totalDuration)}`));
    console.log(colors.cyan(`📊 Average per Video: ${this.formatDuration(avgPerVideo)}`));
    console.log(colors.cyan(`🚀 Processing Rate: ${(results.length / (totalDuration / 1000 / 60)).toFixed(2)} videos/minute`));
    
    // Show phase performance summary
    console.log(colors.gray('\n⏱️  Phase Performance Summary:'));
    Object.entries(this.processingStats.phaseAverages).forEach(([phase, stats]) => {
      if (stats.count > 0) {
        console.log(colors.gray(`   ${phase}: avg ${(stats.avg/1000).toFixed(1)}s (${stats.count} samples)`));
      }
    });
    
    if (errors.length > 0) {
      console.log(colors.yellow('\n⚠️  Failed videos:'));
      errors.forEach(({ video, error, duration }) => {
        console.log(colors.red(`   • ${video.title}: ${error} (${this.formatDuration(duration)})`));
      });
    }

    return { results, errors };
  }

  // Fast version of processVideo
  async processVideoFast(video) {
    const filename = this.sanitizeFilename(video.title);
    console.log(colors.magenta(`\n🎬 Fast processing: ${video.title}`));

    const maxProcessingRetries = 3; // Back to 3 attempts
    let attempt = 1;

    while (attempt <= maxProcessingRetries) {
      try {
        // Check if already processed and verified
        if (this.skipExisting && this.isVideoAlreadyProcessed(filename)) {
          // Double-check with verification
          const isComplete = await this.verifyVideoProcessing(video, filename);
          if (isComplete) {
            console.log(colors.yellow(`⏭️  Already processed and verified: ${video.title}`));
            return;
          } else {
            console.log(colors.yellow(`🔄 Previously processed but incomplete, reprocessing: ${video.title}`));
          }
        }

        // Clean existing captions first to prevent conflicts
        await this.deleteAllCaptionsForVideo(video.videoId, filename);

        // Download and process video (same as before)
        const videoPath = await this.downloadVideo(video);
        const audioPath = path.join(this.tempDir, `${filename}_speech.wav`);
        await this.extractSpeechOnlyAudio(videoPath, audioPath);
        const originalVtt = await this.transcribeWithWhisper(audioPath);

        // Detect language and save original
        const detectedLanguage = this.detectLanguage(originalVtt, video.title);
        const originalLangCode = this.getLanguageCode(detectedLanguage);
        const originalVttPath = path.join(this.outputDir, `${filename}_${originalLangCode}.vtt`);
        await fs.writeFile(originalVttPath, originalVtt, 'utf8');

        // Sequential translation instead of concurrent to reduce API pressure
        const languages = ['ar', 'en', 'fr', 'es', 'it'];
        const targetLanguages = languages.filter(lang => lang !== originalLangCode);

        console.log(colors.magenta(`🚀 Fast concurrent translating to ${targetLanguages.length} languages...`));

        // Process translations concurrently for speed
        const translationPromises = targetLanguages.map(async (targetLang) => {
          try {
            console.log(colors.blue(`🌐 Translating to ${targetLang.toUpperCase()}...`));
            
            const translatedVtt = await this.translateVTTFast(originalVtt, targetLang, originalLangCode);
            const translatedVttPath = path.join(this.outputDir, `${filename}_${targetLang}.vtt`);
            await fs.writeFile(translatedVttPath, translatedVtt, 'utf8');
            
            // Upload to api.video if enabled
            if (process.env.UPLOAD_CAPTIONS?.toLowerCase() === 'true') {
              await this.uploadCaptionToApiVideo(video.videoId, targetLang, translatedVtt, filename);
            }
            
            return { language: targetLang, success: true };
            
          } catch (error) {
            console.error(colors.red(`❌ Translation failed for ${targetLang}:`, error.message));
            return { language: targetLang, success: false, error: error.message };
          }
        });

        // Wait for all translations to complete
        const translationResults = await Promise.all(translationPromises);

        // Verify processing completion
        const isComplete = await this.verifyVideoProcessing(video, filename);
        
        if (isComplete) {
          // Clean up temporary files only after verification
          await fs.remove(videoPath);
          await fs.remove(audioPath);

          const successCount = translationResults.filter(r => r.success).length;
          console.log(colors.green(`✅ Fast completed and verified: ${video.title} (${successCount}/${targetLanguages.length} translations successful)`));
          return; // Success, exit retry loop
        } else {
          throw new Error('Video processing verification failed');
        }

      } catch (error) {
        console.error(colors.red(`❌ Fast processing attempt ${attempt}/${maxProcessingRetries} failed for ${video.title}:`), error.message);
        
        if (attempt === maxProcessingRetries) {
          console.error(colors.red(`❌ Fast processing FAILED after ${maxProcessingRetries} attempts: ${video.title}`));
          throw error;
        } else {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(colors.yellow(`⏳ Retrying in ${waitTime/1000} seconds...`));
          await new Promise(resolve => setTimeout(resolve, waitTime));
          attempt++;
        }
      }
    }
  }

  // Check if video is already processed
  isVideoAlreadyProcessed(filename) {
    const languages = ['ar', 'en', 'fr', 'es', 'it'];
    return languages.every(lang => {
      const vttPath = path.join(this.outputDir, `${filename}_${lang}.vtt`);
      return fs.existsSync(vttPath);
    });
  }

  // Include all the existing methods from the original processor
  // (downloadVideo, extractSpeechOnlyAudio, transcribeWithWhisper, etc.)
  // ... (I'll include the key ones here)

  async downloadVideo(video) {
    const downloadStart = Date.now();
    const videoUrl = video.assets.mp4;
    const filename = this.sanitizeFilename(video.title);
    const videoPath = path.join(this.tempDir, `${filename}.mp4`);

    try {
      console.log(colors.blue(`📥 Downloading ${video.title}...`));
      
      const response = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream',
        timeout: 60000 // 60 second timeout
      });

      const writer = fs.createWriteStream(videoPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const downloadDuration = Date.now() - downloadStart;
      this.updatePhaseStats('download', downloadDuration);

      return videoPath;
    } catch (error) {
      console.error(colors.red(`❌ Failed to download ${video.title}:`), error.message);
      throw error;
    }
  }

  async extractSpeechOnlyAudio(videoPath, outputAudioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .audioFilters([
          'highpass=f=300',
          'lowpass=f=3400',
          'compand=attacks=0.3:decays=0.8:points=-80/-80|-45/-15|-27/-9|0/-7|20/-7',
          'afftdn=nf=-25'
        ])
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .format('wav')
        .output(outputAudioPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  async transcribeWithWhisper(audioPath, language = 'auto') {
    const transcriptionStart = Date.now();
    
    try {
      console.log(colors.blue(`🎤 Transcribing audio...`));
      
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
      const { stdout, stderr } = await execAsync(command);
      
      const vttPath = `${outputPath}.vtt`;
      
      if (fs.existsSync(vttPath)) {
        const vttContent = await fs.readFile(vttPath, 'utf8');
        
        const transcriptionDuration = Date.now() - transcriptionStart;
        this.updatePhaseStats('transcription', transcriptionDuration);
        
        return vttContent;
      } else {
        throw new Error('VTT file not generated by Whisper');
      }
    } catch (error) {
      console.error(colors.red('❌ Transcription failed:'), error.message);
      throw error;
    }
  }

  // Delete all existing captions for a video
  async deleteAllCaptionsForVideo(videoId, filename) {
    const languages = ['ar', 'en', 'fr', 'es', 'it'];
    console.log(colors.yellow(`🧹 Cleaning existing captions for: ${filename}`));
    
    let deletedCount = 0;
    for (const language of languages) {
      try {
        await this.retryWithBackoff(async () => {
          await axios.delete(`${this.baseURL}/videos/${videoId}/captions/${language}`, {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`
            }
          });
        }, `Delete ${language.toUpperCase()} caption`);
        
        deletedCount++;
        console.log(colors.green(`  ✅ Deleted ${language.toUpperCase()} caption`));
      } catch (error) {
        if (error.response?.status === 404) {
          // Caption doesn't exist, that's fine
          console.log(colors.gray(`  ⏭️  ${language.toUpperCase()} caption not found (already clean)`));
        } else {
          console.log(colors.red(`  ❌ Failed to delete ${language.toUpperCase()} caption after retries:`, error.response?.data?.detail || error.message));
        }
      }
      
      // Small delay between deletions for paid models
      await new Promise(resolve => setTimeout(resolve, 100)); // Reduced back to 100ms
    }
    
    if (deletedCount > 0) {
      console.log(colors.green(`✅ Cleaned ${deletedCount} existing captions`));
    } else {
      console.log(colors.gray(`ℹ️  No existing captions found`));
    }
    
    return deletedCount;
  }

  async uploadCaptionToApiVideo(videoId, language, vttContent, filename) {
    const uploadStart = Date.now();
    
    if (!process.env.UPLOAD_CAPTIONS || process.env.UPLOAD_CAPTIONS.toLowerCase() !== 'true') {
      return false;
    }

    try {
      console.log(colors.blue(`📤 Uploading ${language.toUpperCase()} caption...`));
      
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      
      form.append('file', Buffer.from(vttContent, 'utf8'), {
        filename: `${filename}_${language}.vtt`,
        contentType: 'text/vtt'
      });

      // Use retry wrapper for caption upload
      await this.retryWithBackoff(async () => {
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
      }, `Upload ${language.toUpperCase()} caption`);

      const uploadDuration = Date.now() - uploadStart;
      this.updatePhaseStats('upload', uploadDuration);

      console.log(colors.green(`✅ Uploaded ${language.toUpperCase()} caption`));
      return true;
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.detail?.includes('Caption already exists')) {
        console.log(colors.yellow(`⚠️  ${language.toUpperCase()} caption exists, deleting and retrying...`));
        
        // Delete the existing caption and retry with retry wrapper
        try {
          await this.retryWithBackoff(async () => {
            await axios.delete(`${this.baseURL}/videos/${videoId}/captions/${language}`, {
              headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
          }, `Delete existing ${language.toUpperCase()} caption`);
          
          // Wait a moment then retry upload with retry wrapper
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const FormData = (await import('form-data')).default;
          const newForm = new FormData();
          newForm.append('file', Buffer.from(vttContent, 'utf8'), {
            filename: `${filename}_${language}.vtt`,
            contentType: 'text/vtt'
          });
          
          await this.retryWithBackoff(async () => {
            await axios.post(
              `${this.baseURL}/videos/${videoId}/captions/${language}`,
              newForm,
              {
                headers: {
                  'Authorization': `Bearer ${this.accessToken}`,
                  ...newForm.getHeaders()
                }
              }
            );
          }, `Retry upload ${language.toUpperCase()} caption`);
          
          const uploadDuration = Date.now() - uploadStart;
          this.updatePhaseStats('upload', uploadDuration);
          
          console.log(colors.green(`✅ Uploaded ${language.toUpperCase()} caption (after cleanup)`));
          return true;
        } catch (retryError) {
          console.error(colors.red(`❌ Failed to upload ${language} caption after cleanup and retries:`), retryError.response?.data || retryError.message);
          return false;
        }
      } else {
        console.error(colors.red(`❌ Failed to upload ${language} caption after retries:`), error.response?.data || error.message);
        return false;
      }
    }
  }

  // Fast VTT translation using batching
  async translateVTTFast(vttContent, targetLanguage, sourceLanguage = 'auto') {
    const translationStart = Date.now();
    console.log(colors.blue(`🌐 Fast translating VTT content to ${targetLanguage.toUpperCase()}...`));

    if (!this.llmAvailable) {
      throw new Error(`Cannot translate to ${targetLanguage} - LLM translator not available`);
    }

    try {
      const vttLines = vttContent.split('\n');
      const translatedLines = [];
      const subtitleTexts = [];
      const subtitleIndices = [];

      // Parse VTT and collect subtitle texts
      for (let i = 0; i < vttLines.length; i++) {
        const line = vttLines[i].trim();

        // Skip WEBVTT header, empty lines, timestamps, and cue settings
        if (line.startsWith('WEBVTT') || line === '' || line.includes('-->') || 
            line.match(/^(align:|line:|position:|size:|vertical:)/)) {
          translatedLines.push(line);
          continue;
        }

        // This is subtitle text
        if (line !== '') {
          subtitleTexts.push(line);
          subtitleIndices.push(i);
          translatedLines.push('PLACEHOLDER'); // Will be replaced later
        } else {
          translatedLines.push(line);
        }
      }

      if (subtitleTexts.length === 0) {
        throw new Error('No subtitle text found to translate in VTT content');
      }

      console.log(colors.cyan(`📝 Found ${subtitleTexts.length} subtitles to translate`));

      // Batch translate subtitles - NO FALLBACKS, let errors propagate
      const translations = [];
      for (let i = 0; i < subtitleTexts.length; i += this.batchSize) {
        const batch = subtitleTexts.slice(i, i + this.batchSize);
        const batchTranslations = await this.batchTranslateSubtitles(batch, targetLanguage, sourceLanguage);
        translations.push(...batchTranslations);
        
        // Small delay between batches for paid models
        if (i + this.batchSize < subtitleTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Verify we have all translations
      if (translations.length !== subtitleTexts.length) {
        throw new Error(`Translation count mismatch: expected ${subtitleTexts.length}, got ${translations.length}`);
      }

      // Replace placeholders with actual translations
      let translationIndex = 0;
      for (let i = 0; i < translatedLines.length; i++) {
        if (translatedLines[i] === 'PLACEHOLDER') {
          translatedLines[i] = translations[translationIndex];
          translationIndex++;
        }
      }

      const translatedVTT = translatedLines.join('\n');
      
      // Final validation - ensure the VTT doesn't contain placeholder patterns
      if (translatedVTT.includes('[AR]') || translatedVTT.includes('[EN]') || 
          translatedVTT.includes('[FR]') || translatedVTT.includes('[ES]') || 
          translatedVTT.includes('[IT]') || translatedVTT.includes('PLACEHOLDER')) {
        throw new Error(`Translation contains placeholder text - not a real translation`);
      }

      const translationDuration = Date.now() - translationStart;
      this.updatePhaseStats('translation', translationDuration);

      console.log(colors.green(`✅ Fast VTT translation to ${targetLanguage.toUpperCase()} completed and validated`));
      return translatedVTT;

    } catch (error) {
      console.error(colors.red(`❌ Fast VTT translation failed:`, error.message));
      // NO FALLBACK - let the error propagate to fail the video processing
      throw error;
    }
  }

  // Utility methods
  detectLanguage(vttContent, title) {
    const detectedFromContent = detectTextLanguage(vttContent);
    if (detectedFromContent !== 'auto') {
      return this.getLanguageName(detectedFromContent);
    }
    return 'english';
  }

  getLanguageName(code) {
    const codeToName = { 'ar': 'arabic', 'en': 'english', 'fr': 'french', 'es': 'spanish', 'it': 'italian' };
    return codeToName[code] || 'english';
  }

  getLanguageCode(language) {
    const languageMap = { 'arabic': 'ar', 'english': 'en', 'french': 'fr', 'spanish': 'es', 'italian': 'it' };
    return languageMap[language] || 'en';
  }

  sanitizeFilename(filename) {
    return filename
      .replace(/[^\w\s\u0600-\u06FF-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  // Retry wrapper with exponential backoff for rate limits
  async retryWithBackoff(operation, operationName, maxRetries = 5) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Ensure valid token for API.video operations
        if (operationName.includes('caption') || operationName.includes('Caption')) {
          await this.ensureValidToken();
        }
        
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error (429)
        const isRateLimit = error.message.includes('429') || 
                           error.response?.status === 429 ||
                           error.message.includes('rate limit') ||
                           error.message.includes('too many requests');
        
        // Check if it's an auth error (401)
        const isAuthError = error.response?.status === 401;
        
        if (isAuthError && operationName.includes('caption')) {
          console.log(colors.yellow(`🔄 Auth error for ${operationName}, refreshing token...`));
          await this.authenticate();
          // Don't count auth errors as retry attempts, just retry immediately
          continue;
        }
        
        if (isRateLimit && attempt < maxRetries) {
          // Faster backoff for paid models: 2, 8, 20, 40, 60 seconds
          const waitTime = Math.min(2 * Math.pow(2, attempt), 60) * 1000;
          console.log(colors.yellow(`⚠️  ${operationName} rate limited (attempt ${attempt}/${maxRetries}), waiting ${waitTime/1000}s...`));
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // If not a rate limit error or max retries reached, throw the error
        if (!isRateLimit) {
          console.error(colors.red(`❌ ${operationName} failed (non-rate-limit error):`, error.message));
        } else {
          console.error(colors.red(`❌ ${operationName} failed after ${maxRetries} attempts due to rate limits`));
        }
        throw error;
      }
    }
    
    throw lastError;
  }

  // Verify video processing completion
  async verifyVideoProcessing(video, filename) {
    const languages = ['ar', 'en', 'fr', 'es', 'it'];
    const missing = [];
    const invalid = [];
    
    // Check local VTT files (most important) and validate content
    for (const lang of languages) {
      const vttPath = path.join(this.outputDir, `${filename}_${lang}.vtt`);
      if (!await fs.pathExists(vttPath)) {
        missing.push(`${lang} VTT file`);
      } else {
        // Validate VTT content quality
        try {
          const vttContent = await fs.readFile(vttPath, 'utf8');
          
          // Check for placeholder patterns that indicate failed translation
          const placeholderPatterns = [
            `[${lang.toUpperCase()}]`,
            '[AR]', '[EN]', '[FR]', '[ES]', '[IT]',
            'PLACEHOLDER',
            'placeholder',
            'Translation failed',
            'translation failed'
          ];
          
          let hasPlaceholders = false;
          for (const pattern of placeholderPatterns) {
            if (vttContent.includes(pattern)) {
              hasPlaceholders = true;
              break;
            }
          }
          
          // Check if file is too small (likely empty or minimal content)
          const stats = await fs.stat(vttPath);
          const isContentTooSmall = stats.size < 100; // Less than 100 bytes is suspicious
          
          // Check if content looks like actual translation (basic heuristic)
          const subtitleLines = vttContent.split('\n').filter(line => 
            line.trim() && !line.includes('WEBVTT') && !line.includes('-->')
          );
          const hasSubstantialContent = subtitleLines.length > 0 && 
            subtitleLines.some(line => line.trim().length > 10);
          
          if (hasPlaceholders) {
            invalid.push(`${lang} VTT contains placeholder text`);
          } else if (isContentTooSmall) {
            invalid.push(`${lang} VTT file too small (${stats.size} bytes)`);
          } else if (!hasSubstantialContent) {
            invalid.push(`${lang} VTT lacks substantial content`);
          }
          
        } catch (error) {
          invalid.push(`${lang} VTT content validation failed: ${error.message}`);
        }
      }
    }
    
    // If any files are missing or invalid, processing is incomplete
    const allIssues = [...missing, ...invalid];
    if (allIssues.length > 0) {
      console.log(colors.red(`❌ Video processing incomplete. Issues: ${allIssues.join(', ')}`));
      return false;
    }
    
    console.log(colors.green(`✅ Video processing verified complete with valid translations: ${filename}`));
    
    // Optional: Check uploaded captions (if upload is enabled) but don't fail if they're missing
    if (process.env.UPLOAD_CAPTIONS?.toLowerCase() === 'true') {
      await this.verifyUploadedCaptions(video, filename, languages);
    }
    
    return true;
  }

  // Separate method to verify uploaded captions (non-blocking)
  async verifyUploadedCaptions(video, filename, languages) {
    try {
      console.log(colors.blue(`🔍 Checking uploaded captions for ${filename}...`));
      
      // Wait a moment for API to sync
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await this.retryWithBackoff(async () => {
        return await axios.get(`${this.baseURL}/videos/${video.videoId}/captions`, {
          headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });
      }, `Caption verification for ${filename}`, 2); // Only 2 retries for verification
      
      const uploadedCaptions = response.data.data || [];
      const uploadedLanguages = uploadedCaptions.map(cap => cap.srclang);
      
      const missingUploads = languages.filter(lang => !uploadedLanguages.includes(lang));
      
      if (missingUploads.length === 0) {
        console.log(colors.green(`✅ All captions uploaded successfully for ${filename}`));
      } else {
        console.log(colors.yellow(`⚠️  Some captions not yet visible in API for ${filename}: ${missingUploads.join(', ')}`));
        console.log(colors.yellow(`   This is likely due to API sync delays and doesn't affect local VTT files`));
      }
      
    } catch (error) {
      console.log(colors.yellow(`⚠️  Could not verify uploaded captions for ${filename}: ${error.message}`));
      console.log(colors.yellow(`   This doesn't affect processing success - local VTT files are complete`));
    }
  }

  async run() {
    try {
      await this.initialize();
      await this.authenticate();
      
      const allVideos = await this.fetchAllVideos();
      const videosToProcess = this.filterVideosToProcess(allVideos);

      if (videosToProcess.length === 0) {
        console.log(colors.yellow('⚠️  No videos found to process.'));
        return;
      }

      console.log(colors.rainbow(`🚀 Starting FAST processing of ${videosToProcess.length} videos...`));
      
      const startTime = Date.now();
      const { results, errors } = await this.processVideosConcurrently(videosToProcess);
      const endTime = Date.now();
      
      const duration = (endTime - startTime) / 1000;
      const avgTimePerVideo = duration / videosToProcess.length;

      console.log(colors.rainbow('\n🏁 FAST PROCESSING COMPLETE!'));
      console.log(colors.green(`📊 Processed ${results.length} videos successfully in ${duration.toFixed(1)}s`));
      console.log(colors.cyan(`⚡ Average time per video: ${avgTimePerVideo.toFixed(1)}s`));
      console.log(colors.green(`📁 VTT files saved in: ${this.outputDir}`));

    } catch (error) {
      console.error(colors.red('\n❌ Fast processing failed:'), error.message);
      process.exit(1);
    }
  }
}

// Run the fast processor
const processor = new FastVideoToVTTProcessor();
processor.run().catch(console.error); 
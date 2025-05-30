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
    
    // Performance settings
    this.maxConcurrentVideos = parseInt(process.env.MAX_CONCURRENT_VIDEOS) || 1;
    this.maxConcurrentTranslations = parseInt(process.env.MAX_CONCURRENT_TRANSLATIONS) || 1;
    this.batchSize = parseInt(process.env.TRANSLATION_BATCH_SIZE) || 5;
    this.skipExisting = process.env.SKIP_EXISTING_VTTS !== 'false';
    
    // Initialize LLM translator
    this.translator = new LLMTranslator();
    this.llmAvailable = false;
    
    // Create directories
    fs.ensureDirSync(this.outputDir);
    fs.ensureDirSync(this.tempDir);
  }

  async initialize() {
    console.log(colors.rainbow('🚀 Initializing FAST Video-to-VTT Processing...\n'));
    
    // Initialize LLM translator with credits check and model selection
    const llmInitialized = await this.translator.initialize();
    
    if (llmInitialized) {
      // Test LLM connection
      this.llmAvailable = await this.translator.testConnection();
    } else {
      this.llmAvailable = false;
    }
    
    if (!this.llmAvailable) {
      console.log(colors.yellow('⚠️  Continuing with placeholder translations...'));
    }

    console.log(colors.cyan(`🏃‍♂️ Performance Settings:`));
    console.log(colors.cyan(`   📹 Max Concurrent Videos: ${this.maxConcurrentVideos}`));
    console.log(colors.cyan(`   🌐 Max Concurrent Translations: ${this.maxConcurrentTranslations}`));
    console.log(colors.cyan(`   📦 Translation Batch Size: ${this.batchSize}`));
    console.log(colors.cyan(`   ⏭️  Skip Existing VTTs: ${this.skipExisting}`));
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
      return subtitles.map(subtitle => `[${targetLanguage.toUpperCase()}] ${subtitle}`);
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

      // If we didn't get enough translations, fill with fallbacks
      while (translations.length < subtitles.length) {
        const missingIndex = translations.length;
        translations.push(`[${targetLanguage.toUpperCase()}] ${subtitles[missingIndex]}`);
      }

      console.log(colors.green(`✅ Batch translated ${translations.length} subtitles to ${targetLanguage.toUpperCase()}`));
      return translations;

    } catch (error) {
      console.error(colors.red(`❌ Batch translation failed for ${targetLanguage} after all retries:`, error.message));
      // Fallback to placeholders
      return subtitles.map(subtitle => `[${targetLanguage.toUpperCase()}] ${subtitle}`);
    }
  }

  // Fast VTT translation using batching
  async translateVTTFast(vttContent, targetLanguage, sourceLanguage = 'auto') {
    console.log(colors.blue(`🌐 Fast translating VTT content to ${targetLanguage.toUpperCase()}...`));

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

      console.log(colors.cyan(`📝 Found ${subtitleTexts.length} subtitles to translate`));

      // Batch translate subtitles
      const translations = [];
      for (let i = 0; i < subtitleTexts.length; i += this.batchSize) {
        const batch = subtitleTexts.slice(i, i + this.batchSize);
        const batchTranslations = await this.batchTranslateSubtitles(batch, targetLanguage, sourceLanguage);
        translations.push(...batchTranslations);
        
        // Small delay between batches to reduce API pressure
        if (i + this.batchSize < subtitleTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Increased to 5 seconds
        }
      }

      // Replace placeholders with actual translations
      let translationIndex = 0;
      for (let i = 0; i < translatedLines.length; i++) {
        if (translatedLines[i] === 'PLACEHOLDER') {
          translatedLines[i] = translations[translationIndex] || subtitleTexts[translationIndex];
          translationIndex++;
        }
      }

      const translatedVTT = translatedLines.join('\n');
      console.log(colors.green(`✅ Fast VTT translation to ${targetLanguage.toUpperCase()} completed`));
      return translatedVTT;

    } catch (error) {
      console.error(colors.red(`❌ Fast VTT translation failed:`, error.message));
      throw error;
    }
  }

  // Process multiple videos concurrently
  async processVideosConcurrently(videos) {
    const results = [];
    const errors = [];
    
    // Create progress bar
    const progressBar = new cliProgress.SingleBar({
      format: 'Progress |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Videos || Active: {active}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(videos.length, 0, { active: 'Starting...' });

    const semaphore = new Array(this.maxConcurrentVideos).fill(null);
    let completed = 0;
    let started = 0;

    const processNext = async (index) => {
      if (started >= videos.length) return;
      
      const videoIndex = started++;
      const video = videos[videoIndex];
      
      try {
        progressBar.update(completed, { active: `${this.maxConcurrentVideos - semaphore.filter(s => s === null).length} active` });
        
        await this.processVideoFast(video);
        results.push({ video, success: true });
      } catch (error) {
        console.error(colors.red(`❌ Failed to process ${video.title}:`), error.message);
        errors.push({ video, error: error.message });
      } finally {
        completed++;
        progressBar.update(completed);
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

    console.log(colors.rainbow('\n📊 Processing Summary:'));
    console.log(colors.green(`✅ Successful: ${results.length}`));
    console.log(colors.red(`❌ Failed: ${errors.length}`));
    
    if (errors.length > 0) {
      console.log(colors.yellow('\n⚠️  Failed videos:'));
      errors.forEach(({ video, error }) => {
        console.log(colors.red(`   • ${video.title}: ${error}`));
      });
    }

    return { results, errors };
  }

  // Fast version of processVideo
  async processVideoFast(video) {
    const filename = this.sanitizeFilename(video.title);
    console.log(colors.magenta(`\n🎬 Fast processing: ${video.title}`));

    const maxProcessingRetries = 2;
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

        console.log(colors.magenta(`🔄 Sequentially translating to ${targetLanguages.length} languages...`));

        // Process translations sequentially with delays
        const translationResults = [];
        for (const targetLang of targetLanguages) {
          try {
            console.log(colors.blue(`🌐 Translating to ${targetLang.toUpperCase()}...`));
            
            const translatedVtt = await this.translateVTTFast(originalVtt, targetLang, originalLangCode);
            const translatedVttPath = path.join(this.outputDir, `${filename}_${targetLang}.vtt`);
            await fs.writeFile(translatedVttPath, translatedVtt, 'utf8');
            
            // Upload to api.video if enabled
            if (process.env.UPLOAD_CAPTIONS?.toLowerCase() === 'true') {
              await this.uploadCaptionToApiVideo(video.videoId, targetLang, translatedVtt, filename);
            }
            
            translationResults.push({ language: targetLang, success: true });
            
            // Delay between languages to reduce API pressure
            if (targetLang !== targetLanguages[targetLanguages.length - 1]) {
              console.log(colors.gray(`⏳ Waiting 10 seconds before next language...`));
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
            
          } catch (error) {
            console.error(colors.red(`❌ Translation failed for ${targetLang}:`, error.message));
            translationResults.push({ language: targetLang, success: false, error: error.message });
          }
        }

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
    const videoUrl = video.assets.mp4;
    const filename = this.sanitizeFilename(video.title);
    const videoPath = path.join(this.tempDir, `${filename}.mp4`);

    try {
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
    try {
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
      
      // Small delay between deletions
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    if (deletedCount > 0) {
      console.log(colors.green(`✅ Cleaned ${deletedCount} existing captions`));
    } else {
      console.log(colors.gray(`ℹ️  No existing captions found`));
    }
    
    return deletedCount;
  }

  async uploadCaptionToApiVideo(videoId, language, vttContent, filename) {
    if (!process.env.UPLOAD_CAPTIONS || process.env.UPLOAD_CAPTIONS.toLowerCase() !== 'true') {
      return false;
    }

    try {
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
  async retryWithBackoff(operation, operationName, maxRetries = 3) {
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
          // Much more conservative backoff: 30, 120, 300 seconds (5 minutes max)
          const waitTime = Math.min(30 * Math.pow(4, attempt - 1), 300) * 1000;
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
    
    // Check local VTT files
    for (const lang of languages) {
      const vttPath = path.join(this.outputDir, `${filename}_${lang}.vtt`);
      if (!await fs.pathExists(vttPath)) {
        missing.push(`${lang} VTT file`);
      }
    }
    
    // Check uploaded captions (if upload is enabled)
    if (process.env.UPLOAD_CAPTIONS?.toLowerCase() === 'true') {
      for (const lang of languages) {
        try {
          await this.retryWithBackoff(async () => {
            const response = await axios.get(`${this.baseURL}/videos/${video.videoId}/captions`, {
              headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            
            const hasCaptionForLang = response.data.data.some(caption => caption.srclang === lang);
            if (!hasCaptionForLang) {
              missing.push(`${lang} uploaded caption`);
            }
          }, `Caption verification for ${lang}`);
        } catch (error) {
          missing.push(`${lang} caption verification (API error)`);
        }
      }
    }
    
    if (missing.length > 0) {
      console.log(colors.red(`❌ Video processing incomplete. Missing: ${missing.join(', ')}`));
      return false;
    }
    
    console.log(colors.green(`✅ Video processing verified complete: ${filename}`));
    return true;
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
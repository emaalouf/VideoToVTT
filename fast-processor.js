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
    this.outputDir = process.env.OUTPUT_DIR || './output';
    this.tempDir = process.env.TEMP_DIR || './temp';
    this.whisperPath = process.env.WHISPER_CPP_PATH || './whisper.cpp/main';
    this.modelPath = process.env.WHISPER_MODEL_PATH || './whisper.cpp/models/ggml-base.bin';
    
    // Performance settings
    this.maxConcurrentVideos = parseInt(process.env.MAX_CONCURRENT_VIDEOS) || 3;
    this.maxConcurrentTranslations = parseInt(process.env.MAX_CONCURRENT_TRANSLATIONS) || 5;
    this.batchSize = parseInt(process.env.TRANSLATION_BATCH_SIZE) || 10; // Translate multiple subtitles at once
    this.skipExisting = process.env.SKIP_EXISTING_VTTS !== 'false'; // Skip if VTT files already exist
    
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
      
      const response = await this.translator.translateWithOpenRouter(batchPrompt);
      
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
      console.error(colors.red(`❌ Batch translation failed for ${targetLanguage}:`, error.message));
      // Fallback to individual placeholders
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
        
        // Small delay between batches
        if (i + this.batchSize < subtitleTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
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

    try {
      // Check if already processed
      if (this.skipExisting && this.isVideoAlreadyProcessed(filename)) {
        console.log(colors.yellow(`⏭️  Already processed: ${video.title}`));
        return;
      }

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

      // Fast concurrent translation to all languages
      const languages = ['ar', 'en', 'fr', 'es', 'it'];
      const targetLanguages = languages.filter(lang => lang !== originalLangCode);

      console.log(colors.magenta(`🚀 Fast translating to ${targetLanguages.length} languages concurrently...`));

      // Process translations concurrently
      const translationPromises = targetLanguages.map(async (targetLang) => {
        try {
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
      
      // Upload original caption
      if (process.env.UPLOAD_CAPTIONS?.toLowerCase() === 'true') {
        await this.uploadCaptionToApiVideo(video.videoId, originalLangCode, originalVtt, filename);
      }

      // Clean up temporary files
      await fs.remove(videoPath);
      await fs.remove(audioPath);

      const successCount = translationResults.filter(r => r.success).length;
      console.log(colors.green(`✅ Fast completed: ${video.title} (${successCount}/${targetLanguages.length} translations successful)`));

    } catch (error) {
      console.error(colors.red(`❌ Fast processing failed for ${video.title}:`), error.message);
      throw error;
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

      return true;
    } catch (error) {
      console.error(colors.red(`❌ Failed to upload ${language} captions:`), error.response?.data || error.message);
      return false;
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
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

    // Check for videos uploaded on May 29th and delete them if configured
    if (process.env.DELETE_MAY_29_VIDEOS && process.env.DELETE_MAY_29_VIDEOS.toLowerCase() === 'true') {
      await this.deleteMay29Videos(allVideos);
    }

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

  async uploadCaptionToApiVideo(videoId, language, vttContent, filename) {
    if (!process.env.UPLOAD_CAPTIONS || process.env.UPLOAD_CAPTIONS.toLowerCase() !== 'true') {
      console.log(colors.yellow(`⏭️  Caption upload disabled for ${language}`));
      return false;
    }

    try {
      console.log(colors.blue(`📤 Uploading ${language} captions to api.video...`));
      
      // Create form data for the VTT file upload
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      
      // Add the VTT file as a buffer
      form.append('file', Buffer.from(vttContent, 'utf8'), {
        filename: `${filename}_${language}.vtt`,
        contentType: 'text/vtt'
      });

      const response = await axios.post(
        `${this.baseURL}/videos/${videoId}/captions/${language}`,
        form,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            ...form.getHeaders()
          }
        }
      );

      console.log(colors.green(`✅ ${language.toUpperCase()} captions uploaded successfully to video ${videoId}`));
      return true;
      
    } catch (error) {
      console.error(colors.red(`❌ Failed to upload ${language} captions:`), error.response?.data || error.message);
      return false;
    }
  }

  async checkExistingCaptions(videoId) {
    try {
      console.log(colors.blue(`🔍 Checking existing captions for video ${videoId}...`));
      
      const response = await axios.get(`${this.baseURL}/videos/${videoId}/captions`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const existingCaptions = response.data.data || [];
      const existingLanguages = existingCaptions.map(caption => caption.srclang);
      
      if (existingCaptions.length > 0) {
        console.log(colors.yellow(`⚠️  Found existing captions: ${existingLanguages.join(', ')}`));
      } else {
        console.log(colors.green(`✅ No existing captions found`));
      }
      
      return existingLanguages;
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(colors.green(`✅ No existing captions found`));
        return [];
      }
      console.error(colors.red(`❌ Failed to check existing captions:`), error.response?.data || error.message);
      return [];
    }
  }

  async deleteCaption(videoId, language) {
    try {
      console.log(colors.blue(`🗑️  Deleting ${language} caption for video ${videoId}...`));
      
      await axios.delete(`${this.baseURL}/videos/${videoId}/captions/${language}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      console.log(colors.green(`✅ ${language.toUpperCase()} caption deleted successfully`));
      return true;
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(colors.yellow(`⚠️  ${language.toUpperCase()} caption not found (already deleted)`));
        return true;
      }
      console.error(colors.red(`❌ Failed to delete ${language} caption:`), error.response?.data || error.message);
      return false;
    }
  }

  async deleteAllExistingCaptions(videoId, existingLanguages) {
    if (existingLanguages.length === 0) {
      return true;
    }

    console.log(colors.blue(`🗑️  Deleting all existing captions (${existingLanguages.join(', ')})...`));
    
    const deletePromises = existingLanguages.map(language => 
      this.deleteCaption(videoId, language)
    );
    
    const results = await Promise.all(deletePromises);
    const successCount = results.filter(result => result).length;
    
    if (successCount === existingLanguages.length) {
      console.log(colors.green(`✅ All existing captions deleted successfully`));
      
      // Wait a moment for the deletion to fully propagate
      console.log(colors.cyan(`⏳ Waiting for deletion to complete...`));
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return true;
    } else {
      console.log(colors.yellow(`⚠️  Some captions failed to delete (${successCount}/${existingLanguages.length} successful)`));
      return false;
    }
  }

  async waitForCaptionDeletion(videoId, maxWaitTime = 30000) {
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds
    
    console.log(colors.cyan(`⏳ Verifying caption deletion completion...`));
    
    while (Date.now() - startTime < maxWaitTime) {
      const existingCaptions = await this.checkExistingCaptions(videoId);
      
      if (existingCaptions.length === 0) {
        console.log(colors.green(`✅ Caption deletion confirmed`));
        return true;
      }
      
      console.log(colors.yellow(`⏳ Still waiting for deletion to complete... (${existingCaptions.join(', ')} remaining)`));
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    console.log(colors.red(`❌ Timeout waiting for caption deletion to complete`));
    return false;
  }

  async processVideo(video) {
    const filename = this.sanitizeFilename(video.title);
    console.log(colors.magenta(`\n🎬 Processing video: ${video.title}`));

    try {
      // Check for existing captions first (only if upload is enabled)
      if (process.env.UPLOAD_CAPTIONS && process.env.UPLOAD_CAPTIONS.toLowerCase() === 'true') {
        const existingCaptions = await this.checkExistingCaptions(video.videoId);
        
        if (existingCaptions.length > 0) {
          if (process.env.REPLACE_EXISTING_CAPTIONS && process.env.REPLACE_EXISTING_CAPTIONS.toLowerCase() === 'true') {
            console.log(colors.yellow(`🔄 Replacing existing captions...`));
            
            // Delete all existing captions
            const deletionSuccess = await this.deleteAllExistingCaptions(video.videoId, existingCaptions);
            
            if (deletionSuccess) {
              // Wait for deletion to complete
              await this.waitForCaptionDeletion(video.videoId);
            } else {
              console.log(colors.red(`❌ Failed to delete existing captions, skipping upload for ${video.title}`));
              // Continue with local file generation but skip upload
            }
          } else {
            console.log(colors.yellow(`⏭️  Captions already exist for ${video.title}, skipping upload (set REPLACE_EXISTING_CAPTIONS=true to replace)`));
            // Continue with local file generation but skip upload
          }
        }
      }

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

      // Upload original captions to api.video
      await this.uploadCaptionToApiVideo(video.videoId, originalLangCode, originalVtt, filename);

      // Translate to other languages
      const languages = ['ar', 'en', 'fr', 'es', 'it'];
      const targetLanguages = languages.filter(lang => lang !== originalLangCode);

      console.log(colors.magenta(`🔄 Starting translations for ${targetLanguages.length} languages: ${targetLanguages.map(lang => lang.toUpperCase()).join(', ')}`));

      for (const targetLang of targetLanguages) {
        console.log(colors.blue(`\n🌍 Processing ${this.getLanguageName(targetLang)} (${targetLang.toUpperCase()}) translation...`));
        
        const translatedVtt = await this.translateVTT(originalVtt, targetLang, originalLangCode);
        const translatedVttPath = path.join(this.outputDir, `${filename}_${targetLang}.vtt`);
        await fs.writeFile(translatedVttPath, translatedVtt, 'utf8');
        
        console.log(colors.green(`✅ Saved ${this.getLanguageName(targetLang)} VTT: ${path.basename(translatedVttPath)}`));
        
        // Show a preview of the translated content
        const previewLines = translatedVtt.split('\n').slice(0, 8);
        const subtitlePreview = previewLines.find(line => line.length > 10 && !line.includes('-->') && !line.startsWith('WEBVTT'));
        if (subtitlePreview) {
          console.log(colors.cyan(`   📖 Preview (${targetLang.toUpperCase()}): "${subtitlePreview.substring(0, 70)}${subtitlePreview.length > 70 ? '...' : ''}"`));
        }

        // Upload translated captions to api.video
        await this.uploadCaptionToApiVideo(video.videoId, targetLang, translatedVtt, filename);
      }

      // Clean up temporary files
      await fs.remove(videoPath);
      await fs.remove(audioPath);

      console.log(colors.green(`✅ Completed processing: ${video.title}`));
      
      // Show summary of generated files
      const allLanguages = [originalLangCode, ...targetLanguages];
      console.log(colors.rainbow(`📄 Generated VTT files for ${video.title}:`));
      allLanguages.forEach(lang => {
        const langName = this.getLanguageName(lang);
        console.log(colors.cyan(`   • ${langName} (${lang.toUpperCase()}): ${filename}_${lang}.vtt`));
      });

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
      'fr': 'french',
      'es': 'spanish',
      'it': 'italian'
    };
    return codeToName[code] || 'english';
  }

  getLanguageCode(language) {
    const languageMap = {
      'arabic': 'ar',
      'english': 'en',
      'french': 'fr',
      'spanish': 'es',
      'italian': 'it'
    };
    return languageMap[language] || 'en';
  }

  sanitizeFilename(filename) {
    return filename
      .replace(/[^\w\s\u0600-\u06FF-]/g, '') // Remove special characters except Arabic, hyphens and spaces
      .replace(/\s+/g, '_')     // Replace spaces with underscores
      .substring(0, 100);       // Limit length
  }

  async deleteVideo(videoId, title) {
    try {
      console.log(colors.blue(`🗑️  Deleting video: ${title} (${videoId})`));
      
      await axios.delete(`${this.baseURL}/videos/${videoId}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      console.log(colors.green(`✅ Video deleted successfully: ${title}`));
      return true;
      
    } catch (error) {
      console.error(colors.red(`❌ Failed to delete video ${title}:`), error.response?.data || error.message);
      return false;
    }
  }

  async deleteMay29Videos(allVideos) {
    console.log(colors.yellow('🔍 Checking for videos uploaded on May 29th...'));
    
    // Filter videos uploaded on May 29th (any year)
    const may29Videos = allVideos.filter(video => {
      try {
        const publishedAt = new Date(video.publishedAt || video.createdAt);
        const month = publishedAt.getMonth() + 1; // getMonth() returns 0-11
        const day = publishedAt.getDate();
        
        return month === 5 && day === 29; // May is month 5, day 29
      } catch (error) {
        console.log(colors.yellow(`⚠️  Could not parse date for video: ${video.title}`));
        return false;
      }
    });

    if (may29Videos.length === 0) {
      console.log(colors.green('✅ No videos found uploaded on May 29th'));
      return;
    }

    console.log(colors.red(`🚨 Found ${may29Videos.length} videos uploaded on May 29th:`));
    may29Videos.forEach(video => {
      const date = new Date(video.publishedAt || video.createdAt);
      console.log(colors.cyan(`   - ${video.title} (${video.videoId}) - ${date.toDateString()}`));
    });

    // Ask for confirmation (in production, you might want to make this automatic)
    console.log(colors.yellow('⚠️  DELETION WILL START IN 5 SECONDS...'));
    console.log(colors.yellow('   Press Ctrl+C to cancel if this was not intended!'));
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delete videos with progress tracking
    console.log(colors.red('🗑️  Starting deletion of May 29th videos...'));
    
    let deletedCount = 0;
    for (const video of may29Videos) {
      const success = await this.deleteVideo(video.videoId, video.title);
      if (success) {
        deletedCount++;
        // Remove from allVideos array so they don't get processed later
        const index = allVideos.findIndex(v => v.videoId === video.videoId);
        if (index > -1) {
          allVideos.splice(index, 1);
        }
      }
      
      // Add a small delay between deletions to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(colors.green(`✅ Deletion complete: ${deletedCount}/${may29Videos.length} videos deleted`));
    console.log(colors.green(`📊 Remaining videos to process: ${allVideos.length}`));
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
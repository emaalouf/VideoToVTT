#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import colors from 'colors';

class VideoProcessingMonitor {
  constructor() {
    this.outputDir = './output';
    this.logFile = './logs/videotovtt-out.log';
    this.startTime = Date.now();
  }

  async getProcessedVideoCount() {
    try {
      const files = await fs.readdir(this.outputDir);
      
      // Count unique video files (each video should have 5 language files)
      const videoFiles = new Set();
      files.forEach(file => {
        if (file.endsWith('.vtt')) {
          // Extract base filename without language suffix
          const baseName = file.replace(/_[a-z]{2}\.vtt$/, '');
          videoFiles.add(baseName);
        }
      });
      
      return videoFiles.size;
    } catch (error) {
      return 0;
    }
  }

  async getLanguageBreakdown() {
    try {
      const files = await fs.readdir(this.outputDir);
      const languages = { ar: 0, en: 0, fr: 0, es: 0, it: 0 };
      
      files.forEach(file => {
        if (file.endsWith('.vtt')) {
          const match = file.match(/_([a-z]{2})\.vtt$/);
          if (match && languages.hasOwnProperty(match[1])) {
            languages[match[1]]++;
          }
        }
      });
      
      return languages;
    } catch (error) {
      return { ar: 0, en: 0, fr: 0, es: 0, it: 0 };
    }
  }

  async getRecentLogEntries(lines = 10) {
    try {
      if (!await fs.pathExists(this.logFile)) {
        return ['Log file not found yet...'];
      }
      
      const logContent = await fs.readFile(this.logFile, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim());
      return logLines.slice(-lines);
    } catch (error) {
      return ['Error reading log file'];
    }
  }

  async getCurrentStatus() {
    const recentLogs = await this.getRecentLogEntries(20);
    
    // Parse status from logs
    let currentVideo = 'Unknown';
    let totalVideos = 474; // Default
    let processedCount = 0;
    
    for (let i = recentLogs.length - 1; i >= 0; i--) {
      const line = recentLogs[i];
      
      if (line.includes('🎬 Fast processing:')) {
        const match = line.match(/🎬 Fast processing: (.+)/);
        if (match) currentVideo = match[1];
      }
      
      if (line.includes('Final videos to process:')) {
        const match = line.match(/Final videos to process: (\d+)/);
        if (match) totalVideos = parseInt(match[1]);
      }
      
      if (line.includes('✅ Fast completed:')) {
        processedCount++;
      }
    }
    
    return { currentVideo, totalVideos, processedCount };
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

  async displayStatus() {
    console.clear();
    console.log(colors.rainbow('🚀 VideoToVTT Full Mode Monitor\n'));
    
    const processedVideos = await this.getProcessedVideoCount();
    const languages = await this.getLanguageBreakdown();
    const status = await this.getCurrentStatus();
    const elapsed = Date.now() - this.startTime;
    
    // Calculate progress
    const totalVideos = status.totalVideos;
    const progress = totalVideos > 0 ? (processedVideos / totalVideos * 100) : 0;
    
    // Estimate completion time
    const avgTimePerVideo = processedVideos > 0 ? elapsed / processedVideos : 0;
    const remainingVideos = Math.max(0, totalVideos - processedVideos);
    const estimatedTimeRemaining = remainingVideos * avgTimePerVideo;
    
    console.log(colors.green('📊 PROGRESS OVERVIEW'));
    console.log(colors.cyan('═'.repeat(50)));
    console.log(colors.yellow(`🎯 Total Videos: ${totalVideos}`));
    console.log(colors.green(`✅ Completed: ${processedVideos}`));
    console.log(colors.blue(`📈 Progress: ${progress.toFixed(1)}%`));
    console.log(colors.magenta(`⏱️  Elapsed: ${this.formatDuration(elapsed)}`));
    
    if (processedVideos > 0) {
      console.log(colors.cyan(`⚡ Avg Time/Video: ${this.formatDuration(avgTimePerVideo)}`));
      console.log(colors.yellow(`🕐 Est. Remaining: ${this.formatDuration(estimatedTimeRemaining)}`));
    }
    
    // Progress bar
    const barLength = 40;
    const filledLength = Math.floor(barLength * progress / 100);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    console.log(colors.cyan(`📊 [${progressBar}] ${progress.toFixed(1)}%`));
    
    console.log(colors.green('\n🌍 LANGUAGE BREAKDOWN'));
    console.log(colors.cyan('═'.repeat(30)));
    console.log(colors.red(`🇸🇦 Arabic (AR): ${languages.ar}`));
    console.log(colors.blue(`🇺🇸 English (EN): ${languages.en}`));
    console.log(colors.white(`🇫🇷 French (FR): ${languages.fr}`));
    console.log(colors.yellow(`🇪🇸 Spanish (ES): ${languages.es}`));
    console.log(colors.green(`🇮🇹 Italian (IT): ${languages.it}`));
    
    console.log(colors.green('\n🎬 CURRENT STATUS'));
    console.log(colors.cyan('═'.repeat(40)));
    console.log(colors.magenta(`Processing: ${status.currentVideo.substring(0, 50)}...`));
    
    console.log(colors.green('\n📝 RECENT LOG ENTRIES'));
    console.log(colors.cyan('═'.repeat(50)));
    const recentLogs = await this.getRecentLogEntries(5);
    recentLogs.forEach(line => {
      if (line.includes('✅')) {
        console.log(colors.green(line.substring(0, 100)));
      } else if (line.includes('❌')) {
        console.log(colors.red(line.substring(0, 100)));
      } else if (line.includes('🎬')) {
        console.log(colors.magenta(line.substring(0, 100)));
      } else {
        console.log(colors.gray(line.substring(0, 100)));
      }
    });
    
    console.log(colors.rainbow('\n🔄 Refreshing every 10 seconds... (Press Ctrl+C to exit)'));
  }

  async start() {
    // Initial display
    await this.displayStatus();
    
    // Update every 10 seconds
    setInterval(async () => {
      await this.displayStatus();
    }, 10000);
  }
}

// Start monitoring
const monitor = new VideoProcessingMonitor();
monitor.start().catch(console.error); 
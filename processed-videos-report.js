#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import colors from 'colors';
import dotenv from 'dotenv';

dotenv.config();

class ProcessedVideosReport {
  constructor() {
    this.apiKey = process.env.API_VIDEO_KEY || 'B6OEQoXryWfHgE9XRsxHGksPwSiyntyz7J30bQY3XkQ';
    this.baseURL = 'https://ws.api.video';
    this.accessToken = null;
    this.outputDir = process.env.OUTPUT_DIR || './output';
    this.languages = ['ar', 'en', 'fr', 'es', 'it'];
    this.languageNames = {
      'ar': 'Arabic',
      'en': 'English', 
      'fr': 'French',
      'es': 'Spanish',
      'it': 'Italian'
    };
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

  sanitizeFilename(filename) {
    return filename
      .replace(/[^\w\s\u0600-\u06FF-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  checkVideoProcessingStatus(video) {
    const filename = this.sanitizeFilename(video.title);
    const status = {
      videoId: video.videoId,
      title: video.title,
      filename: filename,
      createdAt: video.createdAt,
      publishedAt: video.publishedAt,
      duration: video.assets?.mp4 ? 'Available' : 'N/A',
      languages: {},
      completionPercentage: 0,
      isFullyProcessed: false,
      missingLanguages: []
    };

    let processedCount = 0;

    // Check each language
    for (const lang of this.languages) {
      const vttPath = path.join(this.outputDir, `${filename}_${lang}.vtt`);
      const exists = fs.existsSync(vttPath);
      
      let fileSize = 0;
      let lastModified = null;
      
      if (exists) {
        try {
          const stats = fs.statSync(vttPath);
          fileSize = stats.size;
          lastModified = stats.mtime;
          processedCount++;
        } catch (error) {
          // File exists but can't read stats
        }
      }

      status.languages[lang] = {
        processed: exists,
        fileSize: fileSize,
        lastModified: lastModified,
        filePath: vttPath
      };

      if (!exists) {
        status.missingLanguages.push(this.languageNames[lang]);
      }
    }

    status.completionPercentage = Math.round((processedCount / this.languages.length) * 100);
    status.isFullyProcessed = processedCount === this.languages.length;

    return status;
  }

  generateConsoleReport(processedVideos) {
    const fullyProcessed = processedVideos.filter(v => v.isFullyProcessed);
    const partiallyProcessed = processedVideos.filter(v => v.completionPercentage > 0 && !v.isFullyProcessed);
    const notProcessed = processedVideos.filter(v => v.completionPercentage === 0);

    console.log(colors.rainbow('\n📊 PROCESSED VIDEOS REPORT'));
    console.log(colors.rainbow('=' .repeat(50)));
    
    console.log(colors.green(`✅ Fully Processed: ${fullyProcessed.length} videos (${Math.round(fullyProcessed.length / processedVideos.length * 100)}%)`));
    console.log(colors.yellow(`🔄 Partially Processed: ${partiallyProcessed.length} videos (${Math.round(partiallyProcessed.length / processedVideos.length * 100)}%)`));
    console.log(colors.red(`❌ Not Processed: ${notProcessed.length} videos (${Math.round(notProcessed.length / processedVideos.length * 100)}%)`));
    
    console.log(colors.cyan(`📁 Total Videos: ${processedVideos.length}`));
    console.log(colors.cyan(`📝 Total VTT Files: ${processedVideos.reduce((sum, v) => sum + Object.values(v.languages).filter(l => l.processed).length, 0)}`));

    // Show language breakdown
    console.log(colors.rainbow('\n🌐 LANGUAGE BREAKDOWN:'));
    for (const lang of this.languages) {
      const processedInLang = processedVideos.filter(v => v.languages[lang].processed).length;
      const percentage = Math.round(processedInLang / processedVideos.length * 100);
      console.log(colors.cyan(`   ${this.languageNames[lang]}: ${processedInLang}/${processedVideos.length} (${percentage}%)`));
    }

    // Show recent activity
    const recentlyProcessed = processedVideos
      .filter(v => Object.values(v.languages).some(l => l.lastModified))
      .sort((a, b) => {
        const aLatest = Math.max(...Object.values(a.languages).map(l => l.lastModified ? l.lastModified.getTime() : 0));
        const bLatest = Math.max(...Object.values(b.languages).map(l => l.lastModified ? l.lastModified.getTime() : 0));
        return bLatest - aLatest;
      })
      .slice(0, 10);

    if (recentlyProcessed.length > 0) {
      console.log(colors.rainbow('\n⏰ RECENTLY PROCESSED (Last 10):'));
      recentlyProcessed.forEach((video, index) => {
        const latestDate = new Date(Math.max(...Object.values(video.languages).map(l => l.lastModified ? l.lastModified.getTime() : 0)));
        const statusColor = video.isFullyProcessed ? colors.green : colors.yellow;
        console.log(statusColor(`   ${index + 1}. ${video.title} (${video.completionPercentage}%) - ${latestDate.toLocaleString()}`));
      });
    }

    // Show videos that need processing
    if (notProcessed.length > 0) {
      console.log(colors.rainbow('\n❌ VIDEOS NEEDING PROCESSING (First 10):'));
      notProcessed.slice(0, 10).forEach((video, index) => {
        console.log(colors.red(`   ${index + 1}. ${video.title}`));
      });
      if (notProcessed.length > 10) {
        console.log(colors.red(`   ... and ${notProcessed.length - 10} more`));
      }
    }

    return { fullyProcessed, partiallyProcessed, notProcessed };
  }

  async generateDetailedReport(processedVideos) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join('./', `processed-videos-report-${timestamp}.json`);
    const csvPath = path.join('./', `processed-videos-report-${timestamp}.csv`);

    // Generate JSON report
    const report = {
      generatedAt: new Date().toISOString(),
      totalVideos: processedVideos.length,
      summary: {
        fullyProcessed: processedVideos.filter(v => v.isFullyProcessed).length,
        partiallyProcessed: processedVideos.filter(v => v.completionPercentage > 0 && !v.isFullyProcessed).length,
        notProcessed: processedVideos.filter(v => v.completionPercentage === 0).length
      },
      languageBreakdown: {},
      videos: processedVideos
    };

    // Add language breakdown
    for (const lang of this.languages) {
      const processedInLang = processedVideos.filter(v => v.languages[lang].processed).length;
      report.languageBreakdown[this.languageNames[lang]] = {
        processed: processedInLang,
        total: processedVideos.length,
        percentage: Math.round(processedInLang / processedVideos.length * 100)
      };
    }

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(colors.green(`📄 Detailed JSON report saved: ${reportPath}`));

    // Generate CSV report
    const csvHeaders = [
      'Video ID',
      'Title',
      'Filename',
      'Created At',
      'Completion %',
      'Fully Processed',
      'Arabic',
      'English', 
      'French',
      'Spanish',
      'Italian',
      'Missing Languages'
    ];

    const csvRows = processedVideos.map(video => [
      video.videoId,
      `"${video.title.replace(/"/g, '""')}"`, // Escape quotes in CSV
      video.filename,
      video.createdAt,
      video.completionPercentage,
      video.isFullyProcessed ? 'Yes' : 'No',
      video.languages.ar.processed ? 'Yes' : 'No',
      video.languages.en.processed ? 'Yes' : 'No',
      video.languages.fr.processed ? 'Yes' : 'No',
      video.languages.es.processed ? 'Yes' : 'No',
      video.languages.it.processed ? 'Yes' : 'No',
      `"${video.missingLanguages.join(', ')}"`
    ]);

    const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
    await fs.writeFile(csvPath, csvContent, 'utf8');
    console.log(colors.green(`📊 CSV report saved: ${csvPath}`));

    return { reportPath, csvPath };
  }

  async run() {
    try {
      console.log(colors.rainbow('🚀 Generating Processed Videos Report...\n'));
      
      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        console.log(colors.red(`❌ Output directory not found: ${this.outputDir}`));
        console.log(colors.yellow('ℹ️  Run the processor first to generate VTT files.'));
        return;
      }

      await this.authenticate();
      const allVideos = await this.fetchAllVideos();

      console.log(colors.blue('🔍 Analyzing processing status...'));
      
      const processedVideos = allVideos.map(video => this.checkVideoProcessingStatus(video));
      
      // Generate console report
      const { fullyProcessed, partiallyProcessed, notProcessed } = this.generateConsoleReport(processedVideos);
      
      // Generate detailed reports
      const { reportPath, csvPath } = await this.generateDetailedReport(processedVideos);

      console.log(colors.rainbow('\n🎉 Report Generation Complete!'));
      console.log(colors.cyan(`📁 Output directory scanned: ${this.outputDir}`));
      console.log(colors.green(`📄 JSON Report: ${reportPath}`));
      console.log(colors.green(`📊 CSV Report: ${csvPath}`));

    } catch (error) {
      console.error(colors.red('\n❌ Report generation failed:'), error.message);
      process.exit(1);
    }
  }
}

// Run the report generator
const reportGenerator = new ProcessedVideosReport();
reportGenerator.run().catch(console.error); 
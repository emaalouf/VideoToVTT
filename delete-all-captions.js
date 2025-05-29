#!/usr/bin/env node

import axios from 'axios';
import colors from 'colors';

class CaptionCleaner {
  constructor() {
    this.apiKey = 'B6OEQoXryWfHgE9XRsxHGksPwSiyntyz7J30bQY3XkQ';
    this.baseURL = 'https://ws.api.video';
    this.accessToken = null;
    this.languages = ['ar', 'en', 'fr', 'es', 'it'];
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

    console.log(colors.blue('📹 Fetching all videos...'));

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

  async deleteCaption(videoId, language) {
    try {
      await axios.delete(`${this.baseURL}/videos/${videoId}/captions/${language}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      return { success: true };
    } catch (error) {
      if (error.response?.status === 404) {
        return { success: true, message: 'Caption not found (already deleted)' };
      }
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async deleteAllCaptionsForVideo(video) {
    console.log(colors.yellow(`🧹 Cleaning captions for: ${video.title}`));
    
    const results = {};
    
    for (const language of this.languages) {
      const result = await this.deleteCaption(video.videoId, language);
      results[language] = result;
      
      if (result.success) {
        console.log(colors.green(`  ✅ ${language.toUpperCase()}: Deleted`));
      } else {
        console.log(colors.red(`  ❌ ${language.toUpperCase()}: Failed - ${result.error}`));
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  async deleteAllCaptions() {
    try {
      await this.authenticate();
      const videos = await this.fetchAllVideos();
      
      console.log(colors.rainbow(`\n🧹 Starting caption cleanup for ${videos.length} videos...\n`));
      
      let processed = 0;
      let totalDeleted = 0;
      
      for (const video of videos) {
        try {
          const results = await this.deleteAllCaptionsForVideo(video);
          
          // Count successful deletions
          const deleted = Object.values(results).filter(r => r.success).length;
          totalDeleted += deleted;
          
          processed++;
          
          if (processed % 10 === 0) {
            console.log(colors.cyan(`📊 Progress: ${processed}/${videos.length} videos processed`));
          }
          
          // Delay between videos to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          console.error(colors.red(`❌ Failed to process ${video.title}:`), error.message);
        }
      }
      
      console.log(colors.rainbow('\n🎉 Caption cleanup completed!'));
      console.log(colors.green(`📊 Processed: ${processed} videos`));
      console.log(colors.green(`🗑️  Total captions deleted: ${totalDeleted}`));
      console.log(colors.yellow('🚀 Ready for fresh processing!'));
      
    } catch (error) {
      console.error(colors.red('\n❌ Caption cleanup failed:'), error.message);
      process.exit(1);
    }
  }
}

// Run the cleaner
const cleaner = new CaptionCleaner();
cleaner.deleteAllCaptions().catch(console.error); 
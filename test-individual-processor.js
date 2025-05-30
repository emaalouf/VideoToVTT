#!/usr/bin/env node

import { IndividualTranslationProcessor } from './individual-translation-processor.js';
import colors from 'colors';

class TestProcessor extends IndividualTranslationProcessor {
  async getAllVideos() {
    // Override to get only a few videos for testing
    const allVideos = await super.getAllVideos();
    
    // Take only the first 3 videos for testing
    const testVideos = allVideos.slice(0, 3);
    
    console.log(colors.yellow(`🧪 TEST MODE: Processing only ${testVideos.length} videos for testing`));
    console.log(colors.cyan(`   Videos to test: ${testVideos.map(v => v.title).join(', ')}`));
    
    return testVideos;
  }
}

async function main() {
  console.log(colors.rainbow('🧪 TESTING INDIVIDUAL TRANSLATION PROCESSOR\n'));
  console.log(colors.yellow('This will process only the first 3 videos to test the new approach.\n'));
  
  const processor = new TestProcessor();
  
  try {
    await processor.initialize();
    await processor.processAllVideos();
    
    console.log(colors.rainbow('\n🎉 TEST COMPLETED SUCCESSFULLY!'));
    console.log(colors.green('✅ The individual translation approach is working correctly.'));
    console.log(colors.cyan('💡 You can now run the full processor on all videos.'));
    
  } catch (error) {
    console.error(colors.red('❌ Test failed:'), error.message);
    console.log(colors.yellow('💡 Please check the error and fix before running on all videos.'));
    process.exit(1);
  }
}

main(); 
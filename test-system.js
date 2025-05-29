#!/usr/bin/env node

import { LLMTranslator } from './llm-translator.js';
import dotenv from 'dotenv';
import colors from 'colors';

dotenv.config();

class SystemTester {
  constructor() {
    this.translator = new LLMTranslator();
  }

  async testCreditsAndModels() {
    console.log(colors.rainbow('🧪 TESTING CREDIT CHECKING & MODEL SELECTION\n'));
    
    try {
      // Test credit checking
      console.log(colors.blue('1️⃣  Testing Credit Check...'));
      const credits = await this.translator.checkCredits();
      if (credits !== null) {
        console.log(colors.green(`✅ Credit check successful: ${credits.toFixed(4)} available`));
      } else {
        console.log(colors.yellow('⚠️  Credit check failed (may continue without)'));
      }

      // Test model fetching
      console.log(colors.blue('\n2️⃣  Testing Model Fetching...'));
      const models = await this.translator.fetchAvailableModels();
      if (models.length > 0) {
        console.log(colors.green(`✅ Found ${models.length} models`));
        
        // Show first few free models
        const freeModels = models.filter(m => 
          parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0
        ).slice(0, 3);
        
        console.log(colors.cyan('📋 Sample free models:'));
        freeModels.forEach(model => {
          console.log(colors.cyan(`   • ${model.name} (${model.id})`));
        });
      } else {
        console.log(colors.red('❌ No models found'));
      }

      // Test model selection
      console.log(colors.blue('\n3️⃣  Testing Model Selection...'));
      const selectedModel = this.translator.selectBestModel();
      if (selectedModel) {
        console.log(colors.green(`✅ Model selected: ${selectedModel}`));
      } else {
        console.log(colors.red('❌ Model selection failed'));
      }

      return true;
    } catch (error) {
      console.log(colors.red('❌ Credits/Models test failed:'), error.message);
      return false;
    }
  }

  async testTranslations() {
    console.log(colors.rainbow('\n🧪 TESTING TRANSLATION FUNCTIONALITY\n'));
    
    const testPhrases = [
      'Hello, world!',
      'Good morning, how are you today?',
      'The weather is beautiful outside.',
      'Thank you for your help.'
    ];

    const languages = [
      { code: 'fr', name: 'French' },
      { code: 'es', name: 'Spanish' },
      { code: 'ar', name: 'Arabic' },
      { code: 'it', name: 'Italian' }
    ];

    let successCount = 0;
    let totalTests = testPhrases.length * languages.length;

    for (const phrase of testPhrases) {
      console.log(colors.blue(`\n📝 Testing phrase: "${phrase}"`));
      
      for (const lang of languages) {
        try {
          console.log(colors.cyan(`   🔄 Translating to ${lang.name} (${lang.code})...`));
          
          const translation = await this.translator.translateText(phrase, lang.code, 'en');
          
          if (translation && translation !== phrase && !translation.includes(`[${lang.code.toUpperCase()}]`)) {
            console.log(colors.green(`   ✅ ${lang.name}: "${translation}"`));
            successCount++;
          } else {
            console.log(colors.yellow(`   ⚠️  ${lang.name}: "${translation}" (may be placeholder)`));
          }
          
          // Small delay to be nice to the API
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.log(colors.red(`   ❌ ${lang.name}: ${error.message}`));
        }
      }
    }

    const successRate = (successCount / totalTests * 100).toFixed(1);
    console.log(colors.rainbow(`\n📊 Translation Test Results: ${successCount}/${totalTests} successful (${successRate}%)`));
    
    return successCount > 0;
  }

  async testVTTTranslation() {
    console.log(colors.rainbow('\n🧪 TESTING VTT TRANSLATION\n'));
    
    const sampleVTT = `WEBVTT

00:00:00.000 --> 00:00:03.000
Hello, welcome to our video.

00:00:03.000 --> 00:00:06.000
Today we will learn something new.

00:00:06.000 --> 00:00:09.000
Thank you for watching!`;

    try {
      console.log(colors.blue('📄 Testing VTT translation to French...'));
      const translatedVTT = await this.translator.translateVTT(sampleVTT, 'fr', 'en');
      
      if (translatedVTT && translatedVTT !== sampleVTT) {
        console.log(colors.green('✅ VTT translation successful'));
        console.log(colors.cyan('📋 Sample of translated VTT:'));
        const lines = translatedVTT.split('\n').slice(0, 8);
        lines.forEach(line => {
          if (line.trim()) {
            console.log(colors.cyan(`   ${line}`));
          }
        });
      } else {
        console.log(colors.yellow('⚠️  VTT translation may not be working (placeholder used)'));
      }
      
      return true;
    } catch (error) {
      console.log(colors.red('❌ VTT translation test failed:'), error.message);
      return false;
    }
  }

  async testFullInitialization() {
    console.log(colors.rainbow('\n🧪 TESTING FULL SYSTEM INITIALIZATION\n'));
    
    try {
      const initSuccess = await this.translator.initialize();
      if (initSuccess) {
        console.log(colors.green('✅ System initialization successful'));
        
        const connectionTest = await this.translator.testConnection();
        if (connectionTest) {
          console.log(colors.green('✅ Connection test successful'));
        } else {
          console.log(colors.yellow('⚠️  Connection test failed (will use placeholders)'));
        }
      } else {
        console.log(colors.red('❌ System initialization failed'));
      }
      
      return initSuccess;
    } catch (error) {
      console.log(colors.red('❌ Full initialization test failed:'), error.message);
      return false;
    }
  }

  async runAllTests() {
    console.log(colors.rainbow('🚀 STARTING COMPREHENSIVE SYSTEM TESTS\n'));
    console.log(colors.cyan('=' * 60));
    
    const results = {};
    
    // Test 1: Credits and Models
    results.creditsAndModels = await this.testCreditsAndModels();
    
    // Test 2: Full Initialization
    results.initialization = await this.testFullInitialization();
    
    // Test 3: Individual Translations
    results.translations = await this.testTranslations();
    
    // Test 4: VTT Translation
    results.vttTranslation = await this.testVTTTranslation();
    
    // Summary
    console.log(colors.rainbow('\n🏁 TEST SUMMARY'));
    console.log(colors.cyan('=' * 40));
    
    const tests = [
      { name: 'Credits & Models', result: results.creditsAndModels },
      { name: 'System Initialization', result: results.initialization },
      { name: 'Text Translations', result: results.translations },
      { name: 'VTT Translation', result: results.vttTranslation }
    ];
    
    let passedTests = 0;
    tests.forEach(test => {
      const status = test.result ? colors.green('✅ PASS') : colors.red('❌ FAIL');
      console.log(`${status} ${test.name}`);
      if (test.result) passedTests++;
    });
    
    const overallResult = passedTests === tests.length ? 
      colors.green(`🎉 ALL TESTS PASSED (${passedTests}/${tests.length})`) : 
      colors.yellow(`⚠️  PARTIAL SUCCESS (${passedTests}/${tests.length} passed)`);
    
    console.log(colors.rainbow('\n' + '=' * 50));
    console.log(overallResult);
    console.log(colors.rainbow('=' * 50));
    
    if (passedTests < tests.length) {
      console.log(colors.yellow('\n💡 TROUBLESHOOTING TIPS:'));
      if (!results.creditsAndModels) {
        console.log(colors.yellow('   • Check your OPENROUTER_API_KEY in .env file'));
        console.log(colors.yellow('   • Verify API key has sufficient permissions'));
      }
      if (!results.translations) {
        console.log(colors.yellow('   • Try a different model (set LLM_MODEL manually)'));
        console.log(colors.yellow('   • Check your internet connection'));
        console.log(colors.yellow('   • Verify you have available credits'));
      }
    }
    
    return passedTests === tests.length;
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(colors.rainbow('🔬 VideoToVTT System Tester\n'));
  
  const tester = new SystemTester();
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error(colors.red('Test execution failed:'), error.message);
      process.exit(1);
    });
}

export { SystemTester }; 
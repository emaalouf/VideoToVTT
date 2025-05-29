#!/usr/bin/env node

import { LLMTranslator } from './llm-translator.js';
import colors from 'colors';
import dotenv from 'dotenv';

dotenv.config();

async function testLLM() {
  console.log(colors.rainbow('🧪 Testing LLM Translation...\n'));

  const translator = new LLMTranslator();

  // Test connection
  const connectionWorking = await translator.testConnection();

  if (!connectionWorking) {
    console.log(colors.yellow('\n💡 To set up a local LLM with Ollama:'));
    console.log(colors.cyan('1. Install Ollama: curl -fsSL https://ollama.ai/install.sh | sh'));
    console.log(colors.cyan('2. Pull a model: ollama pull deepseek-r1:7b'));
    console.log(colors.cyan('3. Update .env with: LLM_API_URL=http://localhost:11434/api/generate'));
    console.log(colors.cyan('4. Update .env with: LLM_MODEL=deepseek-r1:7b'));
    return;
  }

  console.log(colors.blue('\n🔄 Testing VTT translation...'));

  const sampleVTT = `WEBVTT

00:00:01.000 --> 00:00:03.000
Hello, welcome to our presentation.

00:00:03.000 --> 00:00:06.000
Today we will discuss artificial intelligence.

00:00:06.000 --> 00:00:08.000
Thank you for your attention.`;

  try {
    // Test translation to French
    console.log(colors.blue('Translating to French...'));
    const frenchVTT = await translator.translateVTT(sampleVTT, 'fr', 'en');
    console.log(colors.green('✅ French translation completed'));

    // Test translation to Arabic
    console.log(colors.blue('Translating to Arabic...'));
    const arabicVTT = await translator.translateVTT(sampleVTT, 'ar', 'en');
    console.log(colors.green('✅ Arabic translation completed'));

    console.log(colors.rainbow('\n🎉 LLM translation test completed successfully!'));

  } catch (error) {
    console.error(colors.red('❌ Translation test failed:'), error.message);
  }
}

testLLM().catch(console.error); 
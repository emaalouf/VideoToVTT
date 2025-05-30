#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🔍 OpenRouter API Connection Test');
console.log('==================================');
console.log('');

// Check environment variables
console.log('📋 Environment Check:');
const apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY;
const forcedModel = process.env.FORCE_PAID_MODEL;

if (!apiKey) {
  console.log('❌ No API key found!');
  console.log('   Checked: OPENROUTER_API_KEY, LLM_API_KEY');
  console.log('');
  console.log('💡 Set your API key:');
  console.log('   export OPENROUTER_API_KEY=your-key-here');
  process.exit(1);
} else {
  console.log(`✅ API Key found: ${apiKey.substring(0, 10)}...`);
}

if (forcedModel) {
  console.log(`🔒 Forced model: ${forcedModel}`);
} else {
  console.log('⚠️  No forced model set');
}

console.log('');

// Test 1: Check credits/auth
console.log('📋 Test 1: Authentication & Credits');
try {
  const response = await axios.get('https://openrouter.ai/api/v1/auth/key', {
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });
  
  console.log('✅ Authentication successful!');
  if (response.data.data) {
    console.log(`   Credits: $${response.data.data.usage || 'Unknown'}`);
    console.log(`   Label: ${response.data.data.label || 'No label'}`);
  }
} catch (error) {
  console.log('❌ Authentication failed:', error.message);
  if (error.response) {
    console.log(`   Status: ${error.response.status}`);
    console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
  }
  console.log('');
  console.log('💡 Check your API key at: https://openrouter.ai/keys');
  process.exit(1);
}

console.log('');

// Test 2: Simple translation
console.log('📋 Test 2: Translation Test');
const testModel = forcedModel || 'openai/gpt-4o-mini';

try {
  const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model: testModel,
    messages: [
      {
        role: "user",
        content: "Translate 'Hello' to French. Return only the translation."
      }
    ],
    max_tokens: 50,
    temperature: 0.1
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  });
  
  console.log('✅ Translation successful!');
  console.log(`   Model: ${response.data.model || testModel}`);
  console.log(`   Response: "${response.data.choices[0].message.content.trim()}"`);
  
  if (response.data.usage) {
    console.log(`   Tokens: ${response.data.usage.total_tokens}`);
  }
  
} catch (error) {
  console.log('❌ Translation failed:', error.message);
  if (error.response) {
    console.log(`   Status: ${error.response.status}`);
    console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
  }
}

console.log('');
console.log('🔍 Diagnostic complete!'); 
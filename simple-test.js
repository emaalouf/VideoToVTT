#!/usr/bin/env node

import { LLMTranslator } from './llm-translator.js';
import dotenv from 'dotenv';
import colors from 'colors';

dotenv.config();

console.log(colors.rainbow('🧪 Quick VideoToVTT System Test\n'));

async function runQuickTest() {
    try {
        // Test 1: Check environment
        console.log(colors.blue('1️⃣  Checking Environment...'));
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            console.log(colors.red('❌ OPENROUTER_API_KEY not found in .env file'));
            return false;
        }
        console.log(colors.green(`✅ API Key found: ${apiKey.substring(0, 20)}...`));

        // Test 2: Initialize translator
        console.log(colors.blue('\n2️⃣  Initializing LLM Translator...'));
        const translator = new LLMTranslator();
        const initSuccess = await translator.initialize();
        
        if (!initSuccess) {
            console.log(colors.red('❌ Translator initialization failed'));
            return false;
        }
        console.log(colors.green('✅ Translator initialized'));

        // Test 3: Test connection
        console.log(colors.blue('\n3️⃣  Testing Connection...'));
        const connectionTest = await translator.testConnection();
        
        if (!connectionTest) {
            console.log(colors.yellow('⚠️  Connection test failed (will use placeholders)'));
        }

        // Test 4: Simple translation test
        console.log(colors.blue('\n4️⃣  Testing Translation...'));
        try {
            const testResult = await translator.translateText('Hello, how are you?', 'fr', 'en');
            console.log(colors.cyan(`Source: "Hello, how are you?"`));
            console.log(colors.cyan(`French: "${testResult}"`));
            
            if (testResult && !testResult.includes('[FR]')) {
                console.log(colors.green('✅ Translation working correctly'));
            } else {
                console.log(colors.yellow('⚠️  Using placeholder translations'));
            }
        } catch (error) {
            console.log(colors.red('❌ Translation failed:', error.message));
        }

        // Test 5: Check available credits
        console.log(colors.blue('\n5️⃣  Checking Credits...'));
        if (translator.availableCredits !== null) {
            console.log(colors.green(`✅ Available Credits: ${translator.availableCredits.toFixed(4)}`));
        } else {
            console.log(colors.yellow('⚠️  Could not check credits'));
        }

        // Test 6: Show selected model
        console.log(colors.blue('\n6️⃣  Model Information...'));
        if (translator.selectedModel) {
            console.log(colors.green(`✅ Selected Model: ${translator.selectedModel}`));
        } else {
            console.log(colors.yellow('⚠️  No model selected'));
        }

        console.log(colors.rainbow('\n🎉 Quick test completed!'));
        return true;

    } catch (error) {
        console.log(colors.red('\n❌ Test failed:', error.message));
        return false;
    }
}

// Run the test
runQuickTest()
    .then(success => {
        if (success) {
            console.log(colors.green('\n✅ System appears to be working correctly!'));
            console.log(colors.cyan('💡 You can now run the full system with: node index.js'));
        } else {
            console.log(colors.red('\n❌ Some issues detected. Check configuration.'));
        }
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error(colors.red('Test execution failed:'), error.message);
        process.exit(1);
    }); 
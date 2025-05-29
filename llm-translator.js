import axios from 'axios';
import fs from 'fs-extra';
import colors from 'colors';

export class LLMTranslator {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || process.env.LLM_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
    this.model = config.model || process.env.LLM_MODEL || 'anthropic/claude-3.5-sonnet';
    this.apiKey = config.apiKey || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY;
    this.timeout = config.timeout || 60000; // 60 seconds for cloud APIs
  }

  async translateVTT(vttContent, targetLanguage, sourceLanguage = 'auto') {
    console.log(colors.blue(`🌐 Translating VTT content to ${targetLanguage.toUpperCase()}...`));

    try {
      // Parse VTT content
      const vttLines = vttContent.split('\n');
      const translatedLines = [];
      let subtitleCount = 0;

      let currentSubtitle = '';
      let isSubtitleLine = false;

      for (let i = 0; i < vttLines.length; i++) {
        const line = vttLines[i].trim();

        // Skip WEBVTT header
        if (line.startsWith('WEBVTT')) {
          translatedLines.push(line);
          continue;
        }

        // Skip empty lines
        if (line === '') {
          translatedLines.push('');
          continue;
        }

        // Skip timestamp lines (format: 00:00:00.000 --> 00:00:00.000)
        if (line.includes('-->')) {
          translatedLines.push(line);
          isSubtitleLine = true;
          continue;
        }

        // Skip cue settings (lines that start with alignment, position, etc.)
        if (line.match(/^(align:|line:|position:|size:|vertical:)/)) {
          translatedLines.push(line);
          continue;
        }

        // This is subtitle text - translate it
        if (isSubtitleLine && line !== '') {
          subtitleCount++;
          console.log(colors.cyan(`   📝 Subtitle ${subtitleCount} (${targetLanguage.toUpperCase()}): "${line.substring(0, 60)}${line.length > 60 ? '...' : ''}"`));
          
          const translatedText = await this.translateText(line, targetLanguage, sourceLanguage);
          translatedLines.push(translatedText);
          isSubtitleLine = false;
        } else {
          translatedLines.push(line);
        }
      }

      const translatedVTT = translatedLines.join('\n');
      console.log(colors.green(`✅ VTT translation to ${targetLanguage.toUpperCase()} completed (${subtitleCount} subtitles translated)`));
      return translatedVTT;

    } catch (error) {
      console.error(colors.red(`❌ VTT translation failed:`, error.message));
      throw error;
    }
  }

  async translateText(text, targetLanguage, sourceLanguage = 'auto') {
    if (!text.trim()) return text;

    try {
      console.log(colors.blue(`🔄 Translating to ${targetLanguage.toUpperCase()}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`));
      
      const prompt = this.createTranslationPrompt(text, targetLanguage, sourceLanguage);
      
      let translatedText;
      
      // Try different LLM APIs based on the configured URL
      if (this.apiUrl.includes('openrouter')) {
        translatedText = await this.translateWithOpenRouter(prompt);
      } else if (this.apiUrl.includes('ollama')) {
        translatedText = await this.translateWithOllama(prompt);
      } else if (this.apiUrl.includes('deepseek')) {
        translatedText = await this.translateWithDeepSeek(prompt);
      } else if (this.apiUrl.includes('mistral')) {
        translatedText = await this.translateWithMistral(prompt);
      } else {
        // Default to OpenRouter-compatible format
        translatedText = await this.translateWithOpenRouter(prompt);
      }
      
      console.log(colors.green(`✅ ${targetLanguage.toUpperCase()} Translation: "${translatedText.substring(0, 80)}${translatedText.length > 80 ? '...' : ''}"`));
      return translatedText;

    } catch (error) {
      console.error(colors.red(`❌ Translation failed for ${targetLanguage.toUpperCase()}: "${text.substring(0, 50)}..."`));
      console.error(colors.red(`   Error: ${error.message}`));
      return text; // Return original text if translation fails
    }
  }

  createTranslationPrompt(text, targetLanguage, sourceLanguage) {
    const languageNames = {
      'ar': 'Arabic',
      'en': 'English',
      'fr': 'French',
      'es': 'Spanish',
      'it': 'Italian'
    };

    const targetLangName = languageNames[targetLanguage] || targetLanguage;
    const sourceLangName = sourceLanguage === 'auto' ? 'detected language' : (languageNames[sourceLanguage] || sourceLanguage);

    return `Translate the following text from ${sourceLangName} to ${targetLangName}. 
Only return the translated text without any explanations or additional content.
Preserve the original meaning and tone.

Text to translate: "${text}"

Translation:`;
  }

  async translateWithOllama(prompt) {
    const response = await axios.post(this.apiUrl, {
      model: this.model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.3, // Lower temperature for more consistent translations
        top_p: 0.9,
        max_tokens: 500
      }
    }, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data.response.trim();
  }

  async translateWithDeepSeek(prompt) {
    const response = await axios.post(this.apiUrl, {
      model: this.model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    }, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    return response.data.choices[0].message.content.trim();
  }

  async translateWithMistral(prompt) {
    const response = await axios.post(this.apiUrl, {
      model: this.model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    }, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    return response.data.choices[0].message.content.trim();
  }

  async translateWithOpenRouter(prompt) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required. Please set OPENROUTER_API_KEY or LLM_API_KEY in your environment.');
    }

    const response = await axios.post(this.apiUrl, {
      model: this.model,
      messages: [
        {
          role: "system",
          content: "You are a professional translator. Translate the given text accurately while preserving the original meaning and tone. Return ONLY the translated text without any explanations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 1000,
      top_p: 0.9
    }, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/your-username/VideoToVTT',
        'X-Title': 'VideoToVTT Processor'
      }
    });

    return response.data.choices[0].message.content.trim();
  }

  async translateWithGenericAPI(prompt) {
    const response = await axios.post(this.apiUrl, {
      prompt: prompt,
      model: this.model,
      temperature: 0.3,
      max_tokens: 500
    }, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      }
    });

    // Try to extract response from common response formats
    if (response.data.response) {
      return response.data.response.trim();
    } else if (response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content.trim();
    } else if (response.data.text) {
      return response.data.text.trim();
    } else {
      throw new Error('Unexpected response format from LLM API');
    }
  }

  async testConnection() {
    try {
      console.log(colors.blue('🔍 Testing LLM connection...'));
      
      if (!this.apiKey) {
        console.log(colors.red('❌ No API key found. Please set OPENROUTER_API_KEY or LLM_API_KEY in your environment.'));
        return false;
      }
      
      const testText = await this.translateText('Hello, world!', 'fr', 'en');
      
      if (testText && testText !== 'Hello, world!' && !testText.includes('[FR]')) {
        console.log(colors.green('✅ LLM connection successful!'));
        console.log(colors.cyan(`Test translation: "Hello, world!" → "${testText}"`));
        return true;
      } else {
        console.log(colors.yellow('⚠️  LLM responded but translation may not be working correctly'));
        console.log(colors.yellow(`Response: "${testText}"`));
        return false;
      }
    } catch (error) {
      console.log(colors.red('❌ LLM connection failed:'), error.message);
      if (error.response) {
        console.log(colors.red(`Status: ${error.response.status}`));
        console.log(colors.red(`Data: ${JSON.stringify(error.response.data)}`));
      }
      console.log(colors.yellow('💡 Will use placeholder translations instead'));
      return false;
    }
  }

  // Fallback method for when LLM is not available
  createPlaceholderTranslation(text, targetLanguage) {
    const languagePrefixes = {
      'ar': '[AR]',
      'en': '[EN]',
      'fr': '[FR]',
      'es': '[ES]',
      'it': '[IT]'
    };

    const prefix = languagePrefixes[targetLanguage] || `[${targetLanguage.toUpperCase()}]`;
    return `${prefix} ${text}`;
  }
}

// Export utility function for easy language detection
export function detectTextLanguage(text) {
  const arabicPattern = /[\u0600-\u06FF]/;
  const frenchPattern = /[àâäçéèêëïîôöùûüÿæœ]/i;
  const spanishPattern = /[ñáéíóúü¿¡]/i;
  const italianPattern = /[àèéìíîòóùú]/i;
  const englishPattern = /^[a-zA-Z\s.,!?'"()-]+$/;

  if (arabicPattern.test(text)) {
    return 'ar';
  } else if (frenchPattern.test(text)) {
    return 'fr';
  } else if (spanishPattern.test(text)) {
    return 'es';
  } else if (italianPattern.test(text)) {
    return 'it';
  } else if (englishPattern.test(text)) {
    return 'en';
  } else {
    return 'auto'; // Unknown language
  }
} 
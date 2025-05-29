#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔬 VideoToVTT System Testing Suite${NC}"
echo -e "${BLUE}===================================${NC}\n"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq not found. Installing...${NC}"
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y jq
    elif command -v yum &> /dev/null; then
        sudo yum install -y jq
    elif command -v brew &> /dev/null; then
        brew install jq
    else
        echo -e "${RED}❌ Could not install jq. Please install manually.${NC}"
    fi
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from config.example.env...${NC}"
    if [ -f "config.example.env" ]; then
        cp config.example.env .env
        echo -e "${GREEN}✅ Created .env file from example${NC}"
        echo -e "${YELLOW}📝 Please edit .env file with your API keys before running tests${NC}\n"
    else
        echo -e "${RED}❌ config.example.env not found!${NC}"
        exit 1
    fi
fi

# Check if dependencies are installed
echo -e "${BLUE}📦 Checking dependencies...${NC}"
if ! npm list --depth=0 >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Dependencies missing. Installing...${NC}"
    npm install
fi

# Function to run a specific test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -e "\n${BLUE}🧪 Running ${test_name}...${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ ${test_name} completed${NC}"
        return 0
    else
        echo -e "${RED}❌ ${test_name} failed${NC}"
        return 1
    fi
}

# Function to extract API key from .env
get_api_key() {
    local key=$(grep "^OPENROUTER_API_KEY=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    echo "$key"
}

# Menu for test selection
echo -e "${YELLOW}Select test to run:${NC}"
echo "1. Full System Test (All features)"
echo "2. Quick Credit & Model Check"
echo "3. Translation Test Only"
echo "4. Manual API Test (curl commands)"
echo "5. Run Full VideoToVTT Processing (1 video)"
echo "6. Exit"

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo -e "\n${GREEN}🚀 Running Full System Test...${NC}"
        run_test "Full System Test" "node test-system.js"
        ;;
    
    2)
        echo -e "\n${GREEN}💳 Running Quick Credit & Model Check...${NC}"
        echo -e "${BLUE}Checking OpenRouter credits...${NC}"
        
        # Extract API key from .env file
        API_KEY=$(get_api_key)
        if [ -z "$API_KEY" ]; then
            echo -e "${RED}❌ OPENROUTER_API_KEY not found in .env file${NC}"
            exit 1
        fi
        
        echo -e "${YELLOW}API Key: ${API_KEY:0:20}...${NC}"
        
        # Test credits
        echo -e "\n${BLUE}🔍 Testing credit check...${NC}"
        if command -v jq &> /dev/null; then
            curl -s --location 'https://openrouter.ai/api/v1/credits' \
                --header "Authorization: Bearer $API_KEY" | jq '.'
        else
            curl -s --location 'https://openrouter.ai/api/v1/credits' \
                --header "Authorization: Bearer $API_KEY"
        fi
        
        # Test models
        echo -e "\n${BLUE}🤖 Testing model fetch (first 3 free models)...${NC}"
        if command -v jq &> /dev/null; then
            curl -s --location 'https://openrouter.ai/api/v1/models' | \
                jq -r '.data[] | select(.pricing.prompt == "0" and .pricing.completion == "0") | .name' | \
                head -3
        else
            echo "Raw response (install jq for formatted output):"
            curl -s --location 'https://openrouter.ai/api/v1/models' | head -100
        fi
        ;;
    
    3)
        echo -e "\n${GREEN}🌐 Running Translation Test Only...${NC}"
        node -e "
        import { LLMTranslator } from './llm-translator.js';
        import dotenv from 'dotenv';
        dotenv.config();
        
        const translator = new LLMTranslator();
        await translator.initialize();
        
        console.log('Testing translation: Hello, world! -> French');
        const result = await translator.translateText('Hello, world!', 'fr', 'en');
        console.log('Result:', result);
        
        console.log('\\nTesting translation: Hello, world! -> Arabic');
        const result2 = await translator.translateText('Hello, world!', 'ar', 'en');
        console.log('Result:', result2);
        "
        ;;
    
    4)
        echo -e "\n${GREEN}🔧 Manual API Tests...${NC}"
        API_KEY=$(get_api_key)
        
        if [ -z "$API_KEY" ]; then
            echo -e "${RED}❌ OPENROUTER_API_KEY not found in .env file${NC}"
            exit 1
        fi
        
        echo -e "${BLUE}1. Testing credits API:${NC}"
        curl --location 'https://openrouter.ai/api/v1/credits' \
            --header "Authorization: Bearer $API_KEY"
        
        echo -e "\n\n${BLUE}2. Testing models API (first free model):${NC}"
        if command -v jq &> /dev/null; then
            curl -s --location 'https://openrouter.ai/api/v1/models' | \
                jq '.data[] | select(.pricing.prompt == "0" and .pricing.completion == "0") | {name: .name, id: .id, context: .context_length}' | \
                head -20
        else
            echo "Raw response (install jq for formatted output):"
            curl -s --location 'https://openrouter.ai/api/v1/models' | head -200
        fi
        
        echo -e "\n\n${BLUE}3. Testing translation API:${NC}"
        curl --location 'https://openrouter.ai/api/v1/chat/completions' \
            --header "Authorization: Bearer $API_KEY" \
            --header 'Content-Type: application/json' \
            --data '{
                "model": "deepseek/deepseek-r1-0528-qwen3-8b:free",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a professional translator. Translate the given text accurately while preserving the original meaning and tone. Return ONLY the translated text without any explanations."
                    },
                    {
                        "role": "user",
                        "content": "Translate the following text from English to French. Only return the translated text without any explanations or additional content. Preserve the original meaning and tone. Text to translate: \"Hello, world!\" Translation:"
                    }
                ],
                "temperature": 0.2,
                "max_tokens": 1000
            }'
        ;;
    
    5)
        echo -e "\n${GREEN}🎬 Running Single Video Test...${NC}"
        echo -e "${YELLOW}⚠️  This will process ONE video from your api.video account${NC}"
        echo -e "${YELLOW}⚠️  Make sure you have whisper.cpp installed (run ./setup.sh if needed)${NC}"
        read -p "Continue? (y/N): " confirm
        
        if [[ $confirm =~ ^[Yy]$ ]]; then
            # Create a test version that processes only 1 video
            node -e "
            import('./index.js').then(module => {
                const { VideoToVTTProcessor } = module;
                
                class TestProcessor extends VideoToVTTProcessor {
                    async fetchAllVideos() {
                        const allVideos = await super.fetchAllVideos();
                        console.log('🎯 Testing with first video only:', allVideos[0]?.title);
                        return allVideos.slice(0, 1); // Only process first video
                    }
                }
                
                const processor = new TestProcessor();
                processor.run().catch(console.error);
            });
            "
        else
            echo -e "${YELLOW}Test cancelled${NC}"
        fi
        ;;
    
    6)
        echo -e "${BLUE}👋 Goodbye!${NC}"
        exit 0
        ;;
    
    *)
        echo -e "${RED}❌ Invalid choice. Please run the script again.${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✅ Test completed!${NC}" 
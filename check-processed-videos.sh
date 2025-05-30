#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${PURPLE}🚀 VideoToVTT Processing Status Report${NC}"
echo -e "${PURPLE}=====================================${NC}\n"

# Check if output directory exists
OUTPUT_DIR="./output"
if [ ! -d "$OUTPUT_DIR" ]; then
    echo -e "${YELLOW}⚠️  Output directory not found: $OUTPUT_DIR${NC}"
    echo -e "${BLUE}ℹ️  This means no videos have been processed yet.${NC}"
    echo -e "${BLUE}ℹ️  Run the fast processor to start generating VTT files.${NC}\n"
    
    echo -e "${CYAN}📋 Next Steps:${NC}"
    echo -e "   1. Run: ${GREEN}node fast-processor.js${NC}"
    echo -e "   2. Or run: ${GREEN}./check-processed-videos.sh${NC} again after processing"
    
    exit 0
fi

echo -e "${GREEN}✅ Output directory found: $OUTPUT_DIR${NC}\n"

# Count VTT files by language
declare -A lang_counts
declare -A lang_names
lang_names["ar"]="Arabic"
lang_names["en"]="English"
lang_names["fr"]="French"
lang_names["es"]="Spanish"
lang_names["it"]="Italian"

total_vtt_files=0
unique_videos=0

echo -e "${BLUE}🔍 Scanning VTT files...${NC}"

# Count files for each language
for lang in ar en fr es it; do
    count=$(find "$OUTPUT_DIR" -name "*_${lang}.vtt" | wc -l)
    lang_counts[$lang]=$count
    total_vtt_files=$((total_vtt_files + count))
    echo -e "   ${lang_names[$lang]}: ${count} files"
done

# Find unique video filenames (remove language suffix)
unique_files=$(find "$OUTPUT_DIR" -name "*.vtt" | sed 's/_[a-z][a-z]\.vtt$//' | sort | uniq)
unique_videos=$(echo "$unique_files" | wc -l)

echo -e "\n${CYAN}📊 Summary:${NC}"
echo -e "   📁 Total VTT Files: ${total_vtt_files}"
echo -e "   🎬 Unique Videos with VTTs: ${unique_videos}"

# Check for fully processed videos (all 5 languages)
echo -e "\n${BLUE}🔍 Checking completion status...${NC}"

fully_processed=0
partially_processed=0
processed_videos=()

if [ $unique_videos -gt 0 ]; then
    while IFS= read -r base_filename; do
        if [ -n "$base_filename" ]; then
            video_name=$(basename "$base_filename")
            lang_count=0
            missing_langs=()
            
            for lang in ar en fr es it; do
                if [ -f "${base_filename}_${lang}.vtt" ]; then
                    lang_count=$((lang_count + 1))
                else
                    missing_langs+=("${lang_names[$lang]}")
                fi
            done
            
            if [ $lang_count -eq 5 ]; then
                fully_processed=$((fully_processed + 1))
                processed_videos+=("✅ $video_name (100%)")
            elif [ $lang_count -gt 0 ]; then
                partially_processed=$((partially_processed + 1))
                percentage=$((lang_count * 20))
                missing_str=$(IFS=,; echo "${missing_langs[*]}")
                processed_videos+=("🔄 $video_name (${percentage}%) - Missing: $missing_str")
            fi
        fi
    done <<< "$unique_files"
fi

echo -e "   ${GREEN}✅ Fully Processed: ${fully_processed} videos (100% - all 5 languages)${NC}"
echo -e "   ${YELLOW}🔄 Partially Processed: ${partially_processed} videos${NC}"

# Show recent files
echo -e "\n${PURPLE}⏰ Recently Modified VTT Files (Last 10):${NC}"
recent_files=$(find "$OUTPUT_DIR" -name "*.vtt" -type f -exec ls -lt {} + | head -10)
if [ -n "$recent_files" ]; then
    echo "$recent_files" | while read -r line; do
        filename=$(echo "$line" | awk '{print $9}')
        date_time=$(echo "$line" | awk '{print $6, $7, $8}')
        echo -e "   📄 $(basename "$filename") - $date_time"
    done
else
    echo -e "   ${YELLOW}No VTT files found${NC}"
fi

# Show details for first few processed videos
if [ ${#processed_videos[@]} -gt 0 ]; then
    echo -e "\n${CYAN}📋 Processed Videos Status (First 10):${NC}"
    count=0
    for video in "${processed_videos[@]}"; do
        if [ $count -lt 10 ]; then
            echo -e "   $video"
            count=$((count + 1))
        fi
    done
    
    if [ ${#processed_videos[@]} -gt 10 ]; then
        remaining=$((${#processed_videos[@]} - 10))
        echo -e "   ${YELLOW}... and $remaining more videos${NC}"
    fi
fi

# Save detailed report to file
report_file="processed-videos-summary-$(date +%Y%m%d_%H%M%S).txt"
echo "VideoToVTT Processing Report - $(date)" > "$report_file"
echo "=================================" >> "$report_file"
echo "" >> "$report_file"
echo "Total VTT Files: $total_vtt_files" >> "$report_file"
echo "Unique Videos: $unique_videos" >> "$report_file"
echo "Fully Processed: $fully_processed" >> "$report_file"
echo "Partially Processed: $partially_processed" >> "$report_file"
echo "" >> "$report_file"
echo "Language Breakdown:" >> "$report_file"
for lang in ar en fr es it; do
    echo "  ${lang_names[$lang]}: ${lang_counts[$lang]} files" >> "$report_file"
done
echo "" >> "$report_file"
echo "Processed Videos Details:" >> "$report_file"
for video in "${processed_videos[@]}"; do
    echo "  $video" >> "$report_file"
done

echo -e "\n${GREEN}📄 Report saved to: $report_file${NC}"
echo -e "\n${PURPLE}🎉 Status check complete!${NC}"

# Show next steps
if [ $unique_videos -eq 0 ]; then
    echo -e "\n${CYAN}📋 Next Steps:${NC}"
    echo -e "   1. Run the video processor: ${GREEN}node fast-processor.js${NC}"
    echo -e "   2. Check this report again after processing"
elif [ $partially_processed -gt 0 ]; then
    echo -e "\n${CYAN}📋 Next Steps:${NC}"
    echo -e "   1. Some videos are partially processed"
    echo -e "   2. Re-run the processor to complete missing languages"
    echo -e "   3. Check for any processing errors in the logs"
fi 
#!/bin/bash

# Script to scan CSS files for @font-face declarations, download fonts, and update CSS files
# Usage: ./download_and_update_fonts.sh

set -e  # Exit on any error

# Configuration
SITES_FILE="sites.txt"

# Check if sites.txt exists
if [ ! -f "$SITES_FILE" ]; then
    echo "Error: $SITES_FILE not found!"
    exit 1
fi

# Function to clean filename (lowercase, replace spaces with underscores)
clean_filename() {
    local filename="$1"
    # Convert to lowercase
    filename=$(echo "$filename" | tr '[:upper:]' '[:lower:]')
    # Replace spaces with underscore
    filename=$(echo "$filename" | sed 's/ /_/g')
    # Replace %20 with underscore
    filename=$(echo "$filename" | sed 's/%20/_/g')
    # Remove query parameters
    filename=$(echo "$filename" | sed 's/?.*$//')
    echo "$filename"
}

# Function to download font
download_font() {
    local font_url="$1"
    local local_path="$2"

    echo "Downloading font: $font_url"

    # Create directory if it doesn't exist
    local dir=$(dirname "$local_path")
    mkdir -p "$dir"

    # Download the font
    if curl -s -f -L -o "$local_path" "$font_url"; then
        echo "Successfully downloaded: $local_path"
        return 0
    else
        echo "Failed to download: $font_url"
        return 1
    fi
}

# Function to extract font URLs from CSS content
extract_font_urls() {
    local css_file="$1"
    # Extract URLs from url() in @font-face declarations
    # This regex looks for url(...) patterns and extracts the URL
    grep -o 'url([^)]*)' "$css_file" | sed 's/url(\([^)]*\))/\1/' | sed "s/['\"]//g" | grep -E '\.(woff2?|ttf|eot|otf|svg)' || true
}

# Read each site from sites.txt and process
while IFS= read -r site || [ -n "$site" ]; do
    # Skip empty lines and comments
    [[ -z "$site" || "$site" =~ ^[[:space:]]*# ]] && continue
    
    # Remove any trailing/leading whitespace
    site=$(echo "$site" | xargs)
    
    echo "=========================================="
    echo "Processing site: $site"
    echo "=========================================="
    
    # Set up directories and URLs for this site
    # Try reorganized directory first, fall back to original
    if [ -d "public/reorg/$site" ]; then
        HTML_DIR="public/reorg/$site"
    else
        HTML_DIR="public/$site"
    fi
    FONTS_DIR="$HTML_DIR/fonts"
    BASE_URL="https://$site"
    
    # Check if HTML directory exists
    if [ ! -d "$HTML_DIR" ]; then
        echo "Warning: Directory $HTML_DIR not found, skipping..."
        continue
    fi
    
    # Create fonts directory
    mkdir -p "$FONTS_DIR"
    
    echo "Starting font processing for $HTML_DIR..."
    
    # Create temporary file list
    temp_css_list="/tmp/css_files_$$.txt"
    find "$HTML_DIR" -name "*.css" -type f > "$temp_css_list"
    
    if [ ! -s "$temp_css_list" ]; then
        echo "No CSS files found in $HTML_DIR"
        rm -f "$temp_css_list"
        continue
    fi

    # Process each CSS file
    while IFS= read -r css_file; do
        echo "Processing CSS file: $css_file"
        
        # Create a backup of the original file
        cp "$css_file" "$css_file.backup"
        
        # Extract font URLs into a temp file
        temp_font_urls="/tmp/font_urls_$$.txt"
        extract_font_urls "$css_file" > "$temp_font_urls"
        
        if [ ! -s "$temp_font_urls" ]; then
            echo "No font URLs found in $css_file"
            rm -f "$temp_font_urls"
            continue
        fi
        
        # Process each font URL
        while IFS= read -r font_url; do
            if [[ -z "$font_url" ]]; then
                continue
            fi
            
            # Skip if it's already a local path
            if [[ "$font_url" == fonts/* ]] || [[ "$font_url" == ./fonts/* ]] || [[ "$font_url" == ../fonts/* ]]; then
                echo "Skipping already local path: $font_url"
                continue
            fi
            
            # Skip data URIs
            if [[ "$font_url" == data:* ]]; then
                echo "Skipping data URI"
                continue
            fi
            
            # Check if it's a relative or absolute URL
            if [[ "$font_url" == http* ]]; then
                full_url="$font_url"
            elif [[ "$font_url" == /* ]]; then
                full_url="$BASE_URL$font_url"
            else
                # Relative path - just use the font URL as-is with BASE_URL
                # Most font URLs in @font-face are absolute paths starting with /
                full_url="$BASE_URL/$font_url"
            fi
            
            # Extract filename from URL
            original_filename=$(basename "$font_url" | sed 's/?.*$//' | sed 's/#.*$//')
            clean_name=$(clean_filename "$original_filename")
            
            # Determine local path
            local_path="$FONTS_DIR/$clean_name"
            
            # Download the font if it doesn't exist
            if [ ! -f "$local_path" ]; then
                if download_font "$full_url" "$local_path"; then
                    echo "Downloaded: $clean_name"
                else
                    echo "Skipping update for: $font_url"
                    continue
                fi
            else
                echo "Font already exists: $clean_name"
            fi
            
            # Calculate relative path from CSS file to fonts directory
            # Use simple relative path - fonts are at the root of HTML_DIR
            # CSS files in images/ need to go up one level: ../fonts/
            # CSS files at root level need: fonts/
            css_dir=$(dirname "$css_file")
            
            if [[ "$css_dir" == "$HTML_DIR" ]]; then
                new_font_path="fonts/$clean_name"
            else
                # Count directory levels from HTML_DIR
                relative_part="${css_dir#$HTML_DIR/}"
                level_count=$(echo "$relative_part" | tr -cd '/' | wc -c)
                level_count=$((level_count + 1))
                
                # Build ../ path
                up_path=""
                for ((i=0; i<level_count; i++)); do
                    up_path="../$up_path"
                done
                new_font_path="${up_path}fonts/$clean_name"
            fi
            
            # Update the CSS file with the new path
            # Escape special characters for sed
            escaped_url=$(echo "$font_url" | sed 's/[\/&.]/\\&/g')
            escaped_new_path=$(echo "$new_font_path" | sed 's/[\/&]/\\&/g')
            
            # Replace the URL in the CSS file
            # Handle both url(path) and url('path') and url("path")
            # macOS sed requires '' after -i
            sed -i '' "s|url(['\"]\\{0,1\\}${escaped_url}[#?][^)]*['\"]\\{0,1\\})|url('${escaped_new_path}')|g" "$css_file"
            sed -i '' "s|url(['\"]\\{0,1\\}${escaped_url}['\"]\\{0,1\\})|url('${escaped_new_path}')|g" "$css_file"
            
            echo "Updated CSS file: $font_url -> $new_font_path"
        done < "$temp_font_urls"
        
        # Remove temporary files
        rm -f "$temp_font_urls"
        
        echo "Completed processing: $css_file"
    done < "$temp_css_list"

    # Clean up temp file list
    rm -f "$temp_css_list"
    
    echo "Finished processing site: $site"
    echo ""
done < "$SITES_FILE"

echo "=========================================="
echo "Script completed successfully!"
echo "Backup files have been created with .backup extension"
echo "=========================================="


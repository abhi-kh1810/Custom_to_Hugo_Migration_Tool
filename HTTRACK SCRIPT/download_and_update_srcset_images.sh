#!/bin/bash

# Script to scan HTML files for srcset attributes, download images, and update HTML files
# Usage: ./download_and_update_srcset_images.sh

set -e  # Exit on any error

# Configuration
HTML_DIR="public/www.zecken.de"
IMAGES_DIR="$HTML_DIR/images"
TEMP_DIR="/tmp/srcset_downloads"
BASE_URL="https://www.zecken.de"  # Base URL for downloading images

# Create temporary directory
mkdir -p "$TEMP_DIR"

echo "Starting srcset image processing for $HTML_DIR..."

# Function to clean filename (lowercase, replace spaces and %20 with underscores)
clean_filename() {
    local filename="$1"
    # Convert to lowercase
    filename=$(echo "$filename" | tr '[:upper:]' '[:lower:]')
    # Replace %20 with underscore
    filename=$(echo "$filename" | sed 's/%20/_/g')
    # Replace %40 with underscore
    filename=$(echo "$filename" | sed 's/%40/_/g')
    # Replace spaces with underscore
    filename=$(echo "$filename" | sed 's/ /_/g')
    # Remove any remaining URL encoding
    filename=$(echo "$filename" | sed 's/%[0-9A-Fa-f][0-9A-Fa-f]/_/g')
    # Remove query parameters
    filename=$(echo "$filename" | sed 's/?.*$//')
    echo "$filename"
}

# Function to extract image path from srcset URL
extract_image_path() {
    local srcset="$1"
    # Extract the URL part before the space and query parameters
    local url=$(echo "$srcset" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]].*$//' | sed 's/?.*$//')
    echo "$url"
}

# Function to download image
download_image() {
    local image_url="$1"
    local local_path="$2"

    echo "Downloading: $image_url"

    # Create directory if it doesn't exist
    local dir=$(dirname "$local_path")
    mkdir -p "$dir"

    # Download the image
    if curl -s -f -L -o "$local_path" "$image_url"; then
        echo "Successfully downloaded: $local_path"
        return 0
    else
        echo "Failed to download: $image_url"
        return 1
    fi
}

# Process each HTML file
for html_file in "$HTML_DIR"/*.html; do
    if [ ! -f "$html_file" ]; then
        continue
    fi

    echo "Processing: $(basename "$html_file")"

    # Create a backup of the original file
    cp "$html_file" "$html_file.backup"

    # Extract all srcset attributes and their values
    # This regex matches srcset="..." and captures the content
    while IFS= read -r line; do
        # Extract srcset attribute value
        if [[ $line =~ srcset=\"([^\"]+)\" ]]; then
            srcset_value="${BASH_REMATCH[1]}"

            # Split srcset value by comma to handle multiple sources
            IFS=',' read -ra srcset_parts <<< "$srcset_value"

            for srcset_part in "${srcset_parts[@]}"; do
                # Extract the URL from the srcset part
                image_url=$(extract_image_path "$srcset_part")

                if [[ -n "$image_url" && "$image_url" != "/" ]]; then
                    # Skip if it's already a local path
                    if [[ "$image_url" == /images/* ]]; then
                        continue
                    fi

                    # Construct full URL for downloading
                    full_url="$BASE_URL$image_url"

                    # Extract filename from URL
                    original_filename=$(basename "$image_url")
                    clean_name=$(clean_filename "$original_filename")

                    # Determine local path
                    local_path="$IMAGES_DIR/$clean_name"

                    # Download the image if it doesn't exist
                    if [ ! -f "$local_path" ]; then
                        if download_image "$full_url" "$local_path"; then
                            echo "Downloaded: $clean_name"
                        else
                            echo "Skipping download for: $image_url"
                            continue
                        fi
                    else
                        echo "Image already exists: $clean_name"
                    fi

                    # Update the HTML file with the new path
                    new_srcset="images/$clean_name"

                    # Replace the old srcset value with the new one
                    # We need to be careful to only replace the specific srcset we're processing
                    sed -i.tmp "s|srcset=\"[^\"]*$image_url[^\"]*\"|srcset=\"$new_srcset 1x\"|g" "$html_file"

                    echo "Updated srcset in $(basename "$html_file"): $image_url -> $new_srcset"
                fi
            done
        fi
    done < <(grep -n "srcset=" "$html_file")

    # Remove temporary files
    rm -f "$html_file.tmp"

    echo "Completed processing: $(basename "$html_file")"
done

# Clean up
rm -rf "$TEMP_DIR"

echo "Script completed successfully!"
echo "Backup files have been created with .backup extension"
echo "All images have been downloaded to: $IMAGES_DIR"
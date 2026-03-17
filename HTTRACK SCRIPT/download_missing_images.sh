#!/bin/bash

# Script to download missing images for www.wegweiser-neurodermitis.de site
# Automatically detect missing images from HTML files

cd public/www.wegweiser-neurodermitis.de

# Base URL for the site (using HTTPS)
BASE_URL="https://www.wegweiser-neurodermitis.de"

echo "Scanning HTML files for missing images..."

# Find all image URLs from srcset attributes in HTML files
# Extract image paths and remove duplicates
missing_images=$(grep -r 'srcset=' *.html | grep -o '/sites/default/files/[^"]*' | sed 's/?.*$//' | sort | uniq)

echo "Found image references:"
echo "$missing_images"

echo "Checking which images are missing..."

# Check each image and download if missing
for image in $missing_images; do
    # Clean up the image name (remove any query parameters or extra spaces)
    clean_image=$(echo "$image" | sed 's/?.*$//' | xargs)

    # Extract the filename from the path
    filename=$(basename "$clean_image")

    # Create a clean filename for local storage
    clean_filename=$(echo "$filename" | tr '[:upper:]' '[:lower:]' | sed 's/ /_/g' | sed 's/%20/_/g')

    if [ ! -f "images/$clean_filename" ] || [ $(stat -f%z "images/$clean_filename" 2>/dev/null || stat -c%s "images/$clean_filename" 2>/dev/null) -lt 1000 ]; then
        echo "Downloading missing image: $clean_filename from $image"

        # Remove existing small files
        if [ -f "images/$clean_filename" ] && [ $(stat -f%z "images/$clean_filename" 2>/dev/null || stat -c%s "images/$clean_filename" 2>/dev/null) -lt 1000 ]; then
            rm "images/$clean_filename"
        fi

        # Try to download from the base URL with redirect following
        if curl -L -f -o "images/$clean_filename" "$BASE_URL$image"; then
            echo "Successfully downloaded: $clean_filename"
        else
            echo "Failed to download: $clean_filename from $BASE_URL$image"
        fi
    else
        echo "Image already exists and is valid: $clean_filename"
    fi
done

echo "Download process completed!"
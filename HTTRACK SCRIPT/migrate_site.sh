#!/bin/bash

SITE=$(echo $1 | sed 's|^https?://||')
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
echo "Migrating site: $SITE"

mkdir -p ./tmp

# =====================================================
# SITEMAP PROCESSING (NEW FEATURE)
# =====================================================
# Try to download and parse sitemap.xml to get all URLs
# This ensures we download pages not linked in navigation
# Falls back to regular crawling if sitemap doesn't exist

SITEMAP_URLS=""
SITEMAP_TEMP="./tmp/sitemap_temp.xml"

echo ""
echo "Attempting to download sitemap.xml..."

# Try to download sitemap
if curl -s -f -o "$SITEMAP_TEMP" "https://$SITE/sitemap.xml?context=all" 2>/dev/null; then
    echo "✅ Sitemap downloaded successfully"
    
    # Extract URLs from sitemap (handles both <loc> tags)
    # This regex extracts content between <loc> and </loc> tags
    SITEMAP_URLS=$(grep -oP '(?<=<loc>)[^<]+' "$SITEMAP_TEMP" 2>/dev/null || grep -o '<loc>[^<]*</loc>' "$SITEMAP_TEMP" | sed 's|<loc>||g; s|</loc>||g')
    
    if [ -n "$SITEMAP_URLS" ]; then
        URL_COUNT=$(echo "$SITEMAP_URLS" | wc -l | tr -d ' ')
        echo "✅ Found $URL_COUNT URLs in sitemap"
        echo ""
        echo "Sitemap URLs to download:"
        echo "$SITEMAP_URLS" | head -10
        if [ "$URL_COUNT" -gt 10 ]; then
            echo "... and $((URL_COUNT - 10)) more"
        fi
        echo ""
        
        # Create URL list file for HTTrack
        URLLIST_FILE="./tmp/httrack_urls.txt"
        echo "$SITEMAP_URLS" > "$URLLIST_FILE"
        
        # Add a non-existent URL to capture 404 page with HTTrack
        # This ensures 404.html uses the same normalized filenames as other pages
        echo "https://$SITE/nonexistent-page-for-404-capture" >> "$URLLIST_FILE"
        echo "✅ Added 404 capture URL to download list"
    else
        echo "⚠️  Sitemap exists but no URLs found - proceeding with regular crawl"
    fi
    
    # Clean up temp sitemap
    rm -f "$SITEMAP_TEMP"
else
    echo "⚠️  No sitemap.xml found - proceeding with regular crawl"
fi

echo ""
echo "Starting HTTrack download..."
echo ""

# =====================================================
# HTTRACK DOWNLOAD
# =====================================================
# Run httrack with sitemap URLs if available, otherwise regular crawl

if [ -n "$SITEMAP_URLS" ] && [ -f "$URLLIST_FILE" ]; then
    # Download with sitemap URLs included using --list option
    # The URL list ensures we get all pages even if not linked
    # Using --list is more reliable than passing URLs as command arguments
    echo "Running HTTrack with sitemap URLs (using --list option)..."
    
    # Use HTTrack's --list option to read URLs from file
    # This is much more reliable than passing URLs as command-line arguments
    # and avoids command-line length limitations
    # -%e0: Accept all response codes (including 404) to capture error pages
    # -*index.php*: Exclude URLs containing index.php to prevent duplicate pages (Drupal clean URLs)
    # +*.webp: Explicitly include .webp image files
    # +mime:image/webp: Accept webp MIME type
    httrack https://$SITE --list "$URLLIST_FILE" -w -O ./tmp %T -N1 --depth=3 --robots=0 -%e0 -*index.php* +*.webp +mime:image/webp --quiet </dev/null
    httrack_exit_code=$?
    
    # Keep the URL list for debugging (will be cleaned up with tmp dir later)
    # rm -f "$URLLIST_FILE"
else
    # Original behavior - regular crawl only
    # Also capture 404 page even without sitemap
    # -%e0: Accept all response codes (including 404) to capture error pages
    # -*index.php*: Exclude URLs containing index.php to prevent duplicate pages (Drupal clean URLs)
    # +*.webp: Explicitly include .webp image files
    # +mime:image/webp: Accept webp MIME type
    echo "Running HTTrack with regular crawl..."
    echo "Also capturing 404 page..."
    httrack https://$SITE +https://$SITE/nonexistent-page-for-404-capture -w -O ./tmp %T -N1 --depth=3 --robots=0 -%e0 -*index.php* +*.webp +mime:image/webp --quiet </dev/null
    httrack_exit_code=$?
fi

echo ""
echo "HTTrack exit code: $httrack_exit_code"
echo ""

# Continue processing even if httrack had warnings (non-zero exit code)
# Only fail if httrack completely failed (exit code > 1)

# loop through all image files (including webp) and replace all spaces with _ in filenames
# Process all common image extensions: png, jpg, jpeg, svg, gif, webp, ico
find tmp/web -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.svg" -o -iname "*.gif" -o -iname "*.webp" -o -iname "*.ico" \) | while read -r file; do
    if [ -f "$file" ]; then
        # Get directory and filename separately
        dir=$(dirname "$file")
        old_basename=$(basename "$file")
        new_basename="$(echo "$old_basename" | tr ' ' '_')"
        
        old_name="$file"
        new_name="$dir/$new_basename"

        # Only rename if the name actually changed
        if [ "$old_name" != "$new_name" ]; then
            mv "$old_name" "$new_name"
            echo "Renamed: $old_name -> $new_name"

            # Extract just the filename for HTML replacement
            old_filename="$old_basename"
            new_filename="$new_basename"

            # Update all HTML files to reference the new filename
            # Using perl for better handling of special characters and UTF-8
            # -CS enables UTF-8 I/O, \Q...\E treats strings as literals (no regex)
            find tmp/web -name "*.html" -type f -exec perl -CS -pi -e "s/\Q$old_filename\E/$new_filename/g" {} \;

            # Also handle URL-encoded version (%20 instead of space)
            old_filename_encoded=$(echo "$old_filename" | sed 's/ /%20/g')
            find tmp/web -name "*.html" -type f -exec perl -CS -pi -e "s/\Q$old_filename_encoded\E/$new_filename/g" {} \;

            echo "Updated HTML files to reference: $new_filename"
        fi
    fi
done

mv tmp/web public/$SITE

rm -rf tmp

if ! grep -q "href=\"$SITE\"" "public/index.html"; then
    sed -i.bak "s|</body>|    <p><a href=\"$SITE/index.html\">$SITE</a></p>\n</body>|" "public/index.html"
    rm -f public/index.html.bak
    echo "Added link to $SITE in index.html"
else
    echo "Link to $SITE already exists in index.html"
fi

# Exit with success (0) if httrack succeeded or had minor warnings
# httrack often exits with 1 for warnings but still downloads content
if [ $httrack_exit_code -le 1 ]; then
    echo "Migration completed successfully for $SITE"
    exit 0
else
    echo "Migration failed for $SITE (httrack exit code: $httrack_exit_code)"
    exit $httrack_exit_code
fi
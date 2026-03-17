#!/usr/bin/env bash
################################################################################
# download_all_images.sh
#
# Comprehensive script to download ALL images referenced in HTML files
# Handles all types of image references:
# - src="" attributes
# - srcset="" attributes
# - data-src="" and data-srcset"" (lazy loading)
# - background-image:url() in inline styles
# - Drupal paths (/sites/default/files/...)
# - Drupal image styles (/sites/default/files/styles/...)
# - Profile paths (/profiles/...)
#
# Usage: ./download_all_images.sh
################################################################################

# We intentionally do not exit on errors; we log failures and continue
# set -e
set -u
# set -o pipefail  # optional if you want stricter pipeline failures

# --- Validate inputs and derive paths -----------------------------------------

if [ ! -f "../sites.txt" ]; then
  echo "Error: sites.txt not found!"
  exit 1
fi

SITE_NAME=$(head -n 1 ../sites.txt | tr -d '\r\n')
if [ -z "$SITE_NAME" ]; then
  echo "Error: No site found in sites.txt"
  exit 1
fi

HTML_DIR="../public/reorg/$SITE_NAME"
IMAGES_DIR="$HTML_DIR/images"
BASE_URL="https://$SITE_NAME"
FAILED_LOG="$HTML_DIR/failed_downloads.log"

if [ ! -d "$HTML_DIR" ]; then
  echo "Error: HTML directory not found: $HTML_DIR"
  exit 1
fi

mkdir -p "$IMAGES_DIR"
# Clear previous failed downloads log
: > "$FAILED_LOG"

# Temporary file for URL list, ensure cleanup on exit
TMP_URLS_FILE="$(mktemp /tmp/image_urls.XXXXXX)"
export TMP_URLS_FILE   # <-- critical so Python can see it
cleanup() { [ -f "$TMP_URLS_FILE" ] && rm -f "$TMP_URLS_FILE"; }
trap cleanup EXIT

echo "=========================================="
echo " Comprehensive Image Downloader"
echo "=========================================="
echo "Site:       $SITE_NAME"
echo "Base URL:   $BASE_URL"
echo "HTML Dir:   $HTML_DIR"
echo "Images Dir: $IMAGES_DIR"
echo "Failed Log: $FAILED_LOG"
echo ""

# --- Helpers ------------------------------------------------------------------

# Cross-platform file size (Linux and macOS)
file_size() {
  stat -c%s "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null || echo 0
}

# Clean filename (URL-decode, lowercase, replace spaces, strip query)
clean_filename() {
  local filename="$1"
  # Safe Python call via argv
  filename="$(python3 - "$filename" <<'PYEOF'
import sys
from urllib.parse import unquote
print(unquote(sys.argv[1]))
PYEOF
)"
  # lowercase
  filename="$(printf "%s" "$filename" | tr '[:upper:]' '[:lower:]')"
  # replace spaces with underscores
  filename="${filename// /_}"
  # remove query params
  filename="${filename%%\?*}"
  echo "$filename"
}

# Download image with headers; skip if already a decent size
download_image() {
  local url="$1"
  local output="$2"

  if [ -f "$output" ] && [ "$(file_size "$output")" -gt 1000 ]; then
    echo " ✓ Already exists: $(basename "$output")"
    return 0
  fi

  echo "   Downloading: $url"
  if curl -s -f -L \
       -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
       -H "Accept: image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" \
       -H "Referer: $BASE_URL/" \
       -o "$output" "$url"; then
    echo " ✓ Downloaded: $(basename "$output")"
    return 0
  else
    echo " ⚠️ Failed: $url"
    echo "$url" >> "$FAILED_LOG"
    return 1
  fi
}

# --- Extract all image URLs using Python (same flow, safer regex/IO) ----------

echo "Extracting image URLs from HTML files..."
# Ensure the Python process sees TMP_URLS_FILE even if the export is removed later:
# TMP_URLS_FILE="$TMP_URLS_FILE" python <<'PYEOF'
python3 <<'PYEOF'
import re
import glob
import os

def clean_drupal_style_path(url):
    """
    Convert Drupal image style paths to original file paths.
    Example:
    /sites/default/files/styles/STYLE_NAME/public/2020-03/image.png?itok=abc
    -> /sites/default/files/2020-03/image.png
    """
    url = re.sub(r'/styles/[^/]+/public/', '/', url)
    url = re.sub(r'/styles/[^/]+/private/', '/', url)
    url = re.sub(r'\?.*$', '', url)
    return url

exts = ('.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.ico', '.bmp', '.tif', '.tiff')
image_urls = set()

html_files = glob.glob('**/*.html', recursive=True)

for html_file in html_files:
    if html_file.endswith('.backup'):
        continue
    try:
        with open(html_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # src / data-src
        for m in re.finditer(r'(?:\bsrc|\bdata-src)\s*=\s*([\'"])([^\'"]+)\1', content, re.IGNORECASE):
            url = m.group(2)
            if url.lower().endswith(exts):
                image_urls.add(clean_drupal_style_path(url))

        # srcset / data-srcset
        for m in re.finditer(r'(?:\bsrcset|\bdata-srcset)\s*=\s*([\'"])([^\'"]+)\1', content, re.IGNORECASE):
            srcset = m.group(2)
            for part in srcset.split(','):
                url = part.strip().split()[0]
                if url.lower().endswith(exts):
                    image_urls.add(clean_drupal_style_path(url))

        # inline CSS background-image
        for m in re.finditer(r'background-image\s*:\s*url\((["\']?)([^)\'"]+)\1\)', content, re.IGNORECASE):
            url = m.group(2)
            if url.lower().endswith(exts):
                image_urls.add(clean_drupal_style_path(url))

    except Exception as e:
        print(f"Error reading {html_file}: {e}")

tmp_path = os.environ.get('TMP_URLS_FILE', '/tmp/image_urls.txt')
with open(tmp_path, 'w', encoding='utf-8') as out:
    for url in sorted(image_urls):
        out.write(url + '\n')

print(f"Found {len(image_urls)} unique image URLs")
PYEOF

echo ""
echo "Downloading images..."

while IFS= read -r image_url; do
  # Skip if already local under images/
  if [[ "$image_url" == /images/* || "$image_url" == images/* || "$image_url" == ./images/* ]]; then
    continue
  fi

  # Extract filename and strip query part
  filename=$(basename "$image_url")
  filename="${filename%%\?*}"

  # Skip common HTTrack artifact files
  if [[ "$filename" =~ ^(backblue|fade|index)\.gif$ || "$filename" =~ ^htt(error|index) ]]; then
    echo " ⏭️  Skipping HTTrack artifact: $filename"
    continue
  fi

  # Construct full URL
  if [[ "$image_url" =~ ^https?:// ]]; then
    full_url="$image_url"
  else
    if [[ "$image_url" == /* ]]; then
      full_url="$BASE_URL$image_url"
    else
      full_url="$BASE_URL/$image_url"
    fi
  fi

  # URL-encode only the path, not scheme/host (pass safely to Python)
  full_url="$(python3 - "$full_url" <<'PYEOF'
import sys
from urllib.parse import quote, urlparse
url = sys.argv[1]
p = urlparse(url)
encoded_path = quote(p.path, safe='/')
print(f"{p.scheme}://{p.netloc}{encoded_path}")
PYEOF
)"

  # Clean local filename and set destination path
  clean_name="$(clean_filename "$filename")"
  local_path="$IMAGES_DIR/$clean_name"

  # Download (do not exit on failure)
  download_image "$full_url" "$local_path" || true

done < "$TMP_URLS_FILE"

# --- Summary ------------------------------------------------------------------

echo ""
echo "=========================================="
echo "Image download completed!"
echo "=========================================="
echo "Images saved to: $IMAGES_DIR"

downloaded_count="$(find "$IMAGES_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "Total images downloaded: $downloaded_count"

if [ -f "$FAILED_LOG" ] && [ -s "$FAILED_LOG" ]; then
  FAILED_COUNT="$(wc -l < "$FAILED_LOG" | tr -d ' ')"
  echo ""
  echo "⚠️  WARNING: $FAILED_COUNT image(s) failed to download"
  echo "Failed downloads logged to: $FAILED_LOG"
  echo ""
  echo "First 10 failed URLs:"
  head -10 "$FAILED_LOG"
  if [ "$FAILED_COUNT" -gt 10 ]; then
    echo "... and $((FAILED_COUNT - 10)) more (see log file)"
  fi
  echo ""
  echo "You can review and manually download these images later."
else
  echo ""
  echo "✅ All images downloaded successfully!"
fi
``
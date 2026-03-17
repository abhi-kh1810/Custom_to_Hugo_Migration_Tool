#!/bin/bash

################################################################################
# wrap_adobe_dtm_scripts.sh
#
# Wraps Adobe DTM scripts with runtime hostname checks to ensure Adobe 
# analytics only loads on production domains.
#
# Usage:
#   ./wrap_adobe_dtm_scripts.sh <sitename> [non-prod-adobe-url] [prod-adobe-url]
#
# Examples:
#   ./wrap_adobe_dtm_scripts.sh www.diccionariomieloma.es
#   ./wrap_adobe_dtm_scripts.sh www.wegweiser-neurodermitis.de https://assets.adobedtm.com/.../launch-dev.min.js
#   ./wrap_adobe_dtm_scripts.sh www.site.com https://nonprod.js https://prod.js
################################################################################

# Don't use set -e as it causes early exit on errors in loops
# set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check parameters
if [ $# -lt 1 ]; then
    printf "${RED}Error: Missing required parameter${NC}\n"
    echo ""
    echo "Usage:"
    echo "  $0 <sitename> [non-prod-adobe-url] [prod-adobe-url]"
    echo ""
    echo "Examples:"
    echo "  $0 www.diccionariomieloma.es"
    echo "  $0 www.wegweiser-neurodermitis.de https://assets.adobedtm.com/.../launch-dev.min.js"
    echo "  $0 www.site.com https://nonprod.js https://prod.js"
    exit 1
fi

SITE_NAME="$1"
NON_PROD_URL="${2:-}"
PROD_URL="${3:-}"

# Strip www. to get base domain
BASE_DOMAIN=$(echo "$SITE_NAME" | sed 's/^www\.//')

# Target directory
TARGET_DIR="../public/reorg/$SITE_NAME"

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    printf "${RED}Error: Target directory not found: $TARGET_DIR${NC}\n"
    exit 1
fi

echo "=========================================="
echo "Adobe DTM Script Wrapper Tool"
echo "=========================================="
echo "Site name: $SITE_NAME"
echo "Domain variants: $SITE_NAME, $BASE_DOMAIN"

# Auto-detect production URL if not provided
if [ -z "$PROD_URL" ]; then
    printf "${BLUE}Prod Adobe URL: Auto-detect from existing scripts${NC}\n"
else
    printf "${GREEN}Prod Adobe URL: $PROD_URL (override)${NC}\n"
fi

if [ -z "$NON_PROD_URL" ]; then
    printf "${YELLOW}Non-prod Adobe URL: Not provided (will use comment placeholder)${NC}\n"
else
    printf "${GREEN}Non-prod Adobe URL: $NON_PROD_URL${NC}\n"
fi

echo "Target directory: $TARGET_DIR"
echo "=========================================="
echo ""
echo "Searching for HTML files..."
echo ""

# Counters
total_files=0
modified_files=0
skipped_files=0
scripts_wrapped=0

# Function to process a single HTML file
process_html_file() {
    local html_file="$1"
    ((total_files++))
    
    # Check if file contains Adobe DTM scripts OR if we're adding new ones
    # If PROD_URL is provided, we can add scripts even if they don't exist
    has_existing_scripts=0
    if grep -q "assets.adobedtm.com" "$html_file" || grep -q "Adobe DTM" "$html_file"; then
        has_existing_scripts=1
    fi
    
    # Auto-detect prod URL from this file if not provided
    # Handle both http:// and https:// protocols
    if [ -z "$PROD_URL" ]; then
        PROD_URL=$(grep -o 'https\?://assets.adobedtm.com[^"]*' "$html_file" | head -1)
        if [ -n "$PROD_URL" ]; then
            printf "${GREEN}Auto-detected production URL: $PROD_URL${NC}\n"
        fi
    fi
    
    # Skip if no prod URL could be determined
    if [ -z "$PROD_URL" ]; then
        if [ $has_existing_scripts -eq 0 ]; then
            printf "Processing: $html_file... ${YELLOW}SKIPPED${NC} (no Adobe DTM scripts found and no PROD_URL provided)\n"
        else
            printf "Processing: $html_file... ${RED}ERROR${NC} (could not determine production URL)\n"
            printf "${YELLOW}Hint: Provide PROD_URL as 3rd argument to process this file${NC}\n"
        fi
        ((skipped_files++))
        return
    fi
    
    # If no existing scripts but PROD_URL provided, we'll add new scripts
    if [ $has_existing_scripts -eq 0 ]; then
        printf "Processing: $html_file... ${BLUE}INFO${NC} (no existing scripts, will add new ones)\n"
    fi
    
    # Create backup if it doesn't exist
    if [ ! -f "$html_file.backup" ]; then
        cp "$html_file" "$html_file.backup"
    fi
    
    # Check if file is already processed
    if grep -q "window.location.hostname" "$html_file" && grep -q "$SITE_NAME" "$html_file"; then
        # File already wrapped - check if we need to update URLs
        # Handle both http:// and https:// protocols
        current_prod=$(grep -o "script.src = '[^']*https\?://assets.adobedtm.com[^']*'" "$html_file" | head -1 | sed "s/script.src = '//;s/'//")
        
        needs_update=0
        if [ "$current_prod" != "$PROD_URL" ]; then
            needs_update=1
        fi
        
        if [ -n "$NON_PROD_URL" ]; then
            if ! grep -q "// Non-production environment" "$html_file" || ! grep -q "$NON_PROD_URL" "$html_file"; then
                needs_update=1
            fi
        fi
        
        if [ $needs_update -eq 0 ]; then
            printf "Processing: $html_file... ${BLUE}SKIPPED${NC} (already processed, no changes needed)\n"
            ((skipped_files++))
            return
        fi
    fi
    
    # Create wrapper script
    if [ -n "$NON_PROD_URL" ]; then
        # With non-prod URL
        WRAPPER="<script>
  (function() {
    var hostname = window.location.hostname;
    if (hostname === '$SITE_NAME' || hostname === '$BASE_DOMAIN') {
      var script = document.createElement('script');
      script.src = '$PROD_URL';
      script.async = true;
      document.head.appendChild(script);
    } else {
      // Non-production environment
      var script = document.createElement('script');
      script.src = '$NON_PROD_URL';
      script.async = true;
      document.head.appendChild(script);
    }
  })();
</script>"
    else
        # Without non-prod URL (comment placeholder)
        WRAPPER="<script>
  (function() {
    var hostname = window.location.hostname;
    if (hostname === '$SITE_NAME' || hostname === '$BASE_DOMAIN') {
      var script = document.createElement('script');
      script.src = '$PROD_URL';
      script.async = true;
      document.head.appendChild(script);
    }
  })();
</script>
<!-- Non-prod Adobe DTM script will go here -->"
    fi
    
    # Use temp file for processing
    temp_file=$(mktemp)
    
    # Use Python to properly remove existing wrapped scripts and original script tags
    # This handles multi-line script blocks correctly
    python3 << PYTHON_CLEANUP
import re
import sys

with open("$html_file", 'r', encoding='utf-8') as f:
    content = f.read()

# Remove script blocks that contain window.location.hostname
# Match from <script> (with optional attributes) to </script> including all content in between
# Use DOTALL flag to match across newlines
pattern = r'<script[^>]*>.*?window\.location\.hostname.*?</script>'
content = re.sub(pattern, '', content, flags=re.DOTALL)

# Remove the comment placeholder
content = content.replace('<!-- Non-prod Adobe DTM script will go here -->', '')

# Remove original Adobe DTM script tags (single line)
pattern2 = r'<script[^>]*src="https?://assets\.adobedtm\.com[^"]*"[^>]*></script>'
content = re.sub(pattern2, '', content)

# Clean up multiple blank lines (more than 2 consecutive)
content = re.sub(r'\n\s*\n\s*\n+', '\n\n', content)

with open("$temp_file", 'w', encoding='utf-8') as f:
    f.write(content)
PYTHON_CLEANUP
    
    # Find the position to insert (in <head> section, before </head>)
    if grep -q "</head>" "$temp_file"; then
        # Write wrapper to temp file for Python to read
        wrapper_file=$(mktemp)
        printf '%s\n' "$WRAPPER" > "$wrapper_file"
        
        # Use Python to insert the wrapper (handles multi-line strings properly)
        python3 << PYTHON_SCRIPT
import sys

# Read the wrapper script from file
with open("$wrapper_file", 'r', encoding='utf-8') as f:
    wrapper = f.read()

# Read the temp file
with open("$temp_file", 'r', encoding='utf-8') as f:
    content = f.read()

# Insert wrapper before </head>
if "</head>" in content:
    content = content.replace("</head>", wrapper + "\n</head>", 1)
    
    # Write back
    with open("$temp_file", 'w', encoding='utf-8') as f:
        f.write(content)

# Clean up wrapper file
import os
os.remove("$wrapper_file")
PYTHON_SCRIPT
        
        # Save back to original file
        mv "$temp_file" "$html_file"
        
        printf "Processing: $html_file... ${GREEN}MODIFIED${NC} (1 script(s) wrapped)\n"
        ((modified_files++))
        ((scripts_wrapped++))
    else
        printf "Processing: $html_file... ${YELLOW}SKIPPED${NC} (no </head> tag found)\n"
        ((skipped_files++))
        rm "$temp_file"
    fi
}

# Find all HTML files and process them
# Use a for loop with proper IFS handling to process all files recursively
# This ensures all files in subdirectories (article/, etc.) are processed
# Note: This handles most filenames correctly; very unusual filenames may need manual processing
IFS=$'\n'
for html_file in $(find "$TARGET_DIR" -name "*.html" ! -name "*.backup" -type f); do
    # Process file (handles paths with spaces when quoted)
    # Use || true to ensure loop continues even if function encounters errors
    process_html_file "$html_file" || true
done
unset IFS

echo ""
echo "=========================================="
echo "Processing Complete!"
echo "=========================================="
echo "Total HTML files found: $total_files"
echo "Files modified: $modified_files"
echo "Files skipped: $skipped_files"
echo "Adobe DTM scripts wrapped: $scripts_wrapped"
echo "=========================================="
echo ""
if [ $modified_files -gt 0 ]; then
    printf "${GREEN}✓ Backup files created with .backup extension${NC}\n"
fi
echo ""


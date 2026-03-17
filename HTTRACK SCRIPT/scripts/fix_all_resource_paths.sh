#!/bin/bash

################################################################################
# fix_all_resource_paths.sh
#
# Comprehensive script to fix ALL resource paths in HTML files:
# - CSS stylesheets (<link rel="stylesheet">)
# - JavaScript files (<script src="">)
# - Image files (src, data-src, icons, etc.)
# - Font paths
# - Other resource paths from Drupal structure
#
# This converts Drupal-specific paths to clean static site paths:
# - /sites/default/files/css/ → /css/
# - /sites/default/files/js/ → /js/
# - /modules/.../js/ → /js/
# - /modules/.../css/ → /css/
# - /profiles/.../images/ → /images/
# - /sites/default/files/ → /images/ (for remaining files)
#
# Usage: ./fix_all_resource_paths.sh [sitename]
#   sitename: Optional site name (defaults to first line of sites.txt)
#
# Example: ./fix_all_resource_paths.sh www.fasting.nu
################################################################################

set -e

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Get site name
if [ -n "$1" ]; then
    SITE_NAME="$1"
    log_info "Using site from argument: $SITE_NAME"
else
    # Try to read from sites.txt
    if [ -f "../sites.txt" ]; then
        SITE_NAME=$(head -n 1 ../sites.txt | tr -d '\r\n')
    elif [ -f "sites.txt" ]; then
        SITE_NAME=$(head -n 1 sites.txt | tr -d '\r\n')
    else
        echo "❌ Error: No site specified and sites.txt not found!"
        exit 1
    fi
    log_info "Using site from sites.txt: $SITE_NAME"
fi

if [ -z "$SITE_NAME" ]; then
    echo "❌ Error: Site name is empty!"
    exit 1
fi

# Determine target directory
if [ -d "../public/reorg/$SITE_NAME" ]; then
    TARGET_DIR="../public/reorg/$SITE_NAME"
elif [ -d "public/reorg/$SITE_NAME" ]; then
    TARGET_DIR="public/reorg/$SITE_NAME"
else
    echo "❌ Error: Target directory not found: public/reorg/$SITE_NAME"
    exit 1
fi

log_info "Target directory: $TARGET_DIR"

echo ""
echo "=========================================="
echo "  Fix All Resource Paths Tool"
echo "=========================================="
echo "Site: $SITE_NAME"
echo "Target: $TARGET_DIR"
echo ""

# Change to target directory
cd "$TARGET_DIR"

# Counter for modified files
MODIFIED_COUNT=0

# Process all HTML files
log_info "Processing HTML files..."
echo ""

# Use Python for robust path replacement
python3 << 'PYEOF'
import os
import re
import glob

def fix_resource_paths(content):
    """Fix all resource paths in HTML content"""
    original = content
    
    # 1. Fix CSS paths
    # /sites/default/files/css/ -> /css/
    content = re.sub(
        r'href="/sites/default/files/css/([^"]+)"',
        r'href="/css/\1"',
        content
    )
    
    # 2. Fix JavaScript paths
    # /sites/default/files/js/ -> /js/
    content = re.sub(
        r'src="/sites/default/files/js/([^"]+)"',
        r'src="/js/\1"',
        content
    )
    
    # /modules/pfizer/pfizer_analytics/js/ -> /js/
    content = re.sub(
        r'src="/modules/pfizer/pfizer_analytics/js/([^"]+)"',
        r'src="/js/\1"',
        content
    )
    
    # /modules/contrib/seckit/js/ -> /js/
    content = re.sub(
        r'src="/modules/contrib/seckit/js/([^"]+)"',
        r'src="/js/\1"',
        content
    )
    
    # Generic /modules/.../js/ -> /js/ (catch-all)
    content = re.sub(
        r'src="/modules/[^/]+/[^/]+/js/([^"]+)"',
        r'src="/js/\1"',
        content
    )
    
    # 3. Fix CSS module paths
    # /modules/contrib/seckit/css/ -> /css/
    content = re.sub(
        r'href="/modules/contrib/seckit/css/([^"]+)"',
        r'href="/css/\1"',
        content
    )
    
    # Generic /modules/.../css/ -> /css/ (catch-all)
    content = re.sub(
        r'href="/modules/[^/]+/[^/]+/css/([^"]+)"',
        r'href="/css/\1"',
        content
    )
    
    # 4. Fix profile paths (images, icons, etc.)
    # profiles/.../tiles/android/ -> /images/
    content = re.sub(
        r'href="/?profiles/[^/]+/themes/[^/]+/tiles/android/([^"]+)"',
        r'href="/images/\1"',
        content
    )
    
    # profiles/.../tiles/ios/ -> /images/
    content = re.sub(
        r'href="/?profiles/[^/]+/themes/[^/]+/tiles/ios/([^"]+)"',
        r'href="/images/\1"',
        content
    )
    
    # profiles/.../images/ -> /images/
    content = re.sub(
        r'(src|href)="/?profiles/[^/]+/themes/[^/]+/images/([^"]+)"',
        r'\1="/images/\2"',
        content
    )
    
    # profiles/.../favicon -> /images/
    content = re.sub(
        r'href="/?profiles/[^/]+/themes/[^/]+/(favicon[^"]+)"',
        r'href="/images/\1"',
        content
    )
    
    # 5. Fix remaining /sites/default/files/ paths (usually images)
    # This should come after specific CSS/JS fixes
    content = re.sub(
        r'(src|href)="/sites/default/files/([^/]+)/([^"]+)"',
        r'\1="/images/\3"',
        content
    )
    
    # Handle /sites/default/files/ without subdirectory
    content = re.sub(
        r'(src|href)="/sites/default/files/([^"]+)"',
        r'\1="/images/\2"',
        content
    )

        # JS: images/*.js  ->  /js/*.js
    content = re.sub(
        r'src="(?:/)?images/([^"?/]+\.js)[^"]*"',
        r'src="/js/\1"',
        content
    )
    content = re.sub(
        r'href="(?:/)?images/([^"?/]+\.js)[^"]*"',
        r'href="/js/\1"',
        content
    )

    # CSS: images/*.css  ->  /css/*.css
    content = re.sub(
        r'href="(?:/)?images/([^"?/]+\.css)[^"]*"',
        r'href="/css/\1"',
        content
    )
    content = re.sub(
        r'src="(?:/)?images/([^"?/]+\.css)[^"]*"',
        r'src="/css/\1"',
        content
    )

    # Documents: images/*.(pdf|doc|docx|ppt|pptx|xls|xlsx)  ->  /files/<same>
    content = re.sub(
        r'href="(?:/)?images/([^"?/]+\.(?:pdf|docx?|pptx?|xlsx?))[^"]*"',
        r'href="/files/\1"',
        content
    )
    content = re.sub(
        r'src="(?:/)?images/([^"?/]+\.(?:pdf|docx?|pptx?|xlsx?))[^"]*"',
        r'src="/files/\1"',
        content
    )

    # Fonts: images/*.(woff|woff2|ttf|otf|eot)  ->  /fonts/<same>
    content = re.sub(
        r'href="(?:/)?images/([^"?/]+\.(?:woff2?|ttf|otf|eot))[^"]*"',
        r'href="/fonts/\1"',
        content
    )
    content = re.sub(
        r'src="(?:/)?images/([^"?/]+\.(?:woff2?|ttf|otf|eot))[^"]*"',
        r'src="/fonts/\1"',
        content
    )

    # Images (png|jpe?g|gif|svg|webp|avif|bmp|ico): keep under /images/, just strip query and normalize
    content = re.sub(
        r'href="(?:/)?images/([^"?/]+\.(?:png|jpe?g|gif|svg|webp|avif|bmp|ico))[^"]*"',
        r'href="/images/\1"',
        content
    )
    content = re.sub(
        r'src="(?:/)?images/([^"?/]+\.(?:png|jpe?g|gif|svg|webp|avif|bmp|ico))[^"]*"',
        r'src="/images/\1"',
        content
    )


    return content, content != original

# Find and process all HTML files
html_files = glob.glob('**/*.html', recursive=True)
modified_count = 0

for html_file in html_files:
    # Skip backup files
    if html_file.endswith('.backup') or html_file.endswith('.original'):
        continue
    
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Fix paths
        fixed_content, was_modified = fix_resource_paths(content)
        
        if was_modified:
            # Write back the fixed content
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(fixed_content)
            
            modified_count += 1
            print(f"  ✓ Updated: {html_file}")
    
    except Exception as e:
        print(f"  ✗ Error processing {html_file}: {e}")

print(f"\n✅ Modified {modified_count} HTML file(s)")
PYEOF

echo ""
echo "=========================================="
log_success "All resource paths fixed successfully!"
echo "=========================================="
echo ""

# Verification
log_info "Verifying fixes..."
echo ""

ISSUES=0

# Check for remaining problematic paths
if grep -r "/sites/default/files/css/" --include="*.html" . 2>/dev/null | grep -v ".backup" | grep -v ".original"; then
    log_warning "Found remaining /sites/default/files/css/ paths"
    ((ISSUES++))
else
    echo "  ✓ No /sites/default/files/css/ paths found"
fi

if grep -r "/sites/default/files/js/" --include="*.html" . 2>/dev/null | grep -v ".backup" | grep -v ".original"; then
    log_warning "Found remaining /sites/default/files/js/ paths"
    ((ISSUES++))
else
    echo "  ✓ No /sites/default/files/js/ paths found"
fi

if grep -r "/modules/" --include="*.html" . 2>/dev/null | grep -E "(\.js|\.css)" | grep -v ".backup" | grep -v ".original"; then
    log_warning "Found remaining /modules/ resource paths"
    ((ISSUES++))
else
    echo "  ✓ No /modules/ resource paths found"
fi

echo ""
if [ $ISSUES -eq 0 ]; then
    log_success "All resource paths are clean!"
else
    log_warning "$ISSUES potential issue(s) found - please review"
fi

echo ""
echo "=========================================="
echo ""

exit 0


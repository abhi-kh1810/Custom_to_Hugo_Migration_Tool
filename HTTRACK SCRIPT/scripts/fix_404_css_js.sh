#!/bin/bash

################################################################################
# fix_404_css_js.sh
#
# Quick fix for existing 404.html pages that have mismatched CSS/JS filenames
# 
# Problem: 404 pages downloaded with curl have different filenames than
#          pages downloaded with HTTrack (case sensitivity, normalization)
#
# Solution: Create symlinks for CSS/JS files so both filename variants work
#
# Usage: ./fix_404_css_js.sh [sitename]
#   sitename: Optional site name (defaults to first line of sites.txt)
#
# Example: ./fix_404_css_js.sh www.fasting.nu
################################################################################

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Get site name
if [ -n "$1" ]; then
    SITE_NAME="$1"
else
    if [ -f "../sites.txt" ]; then
        SITE_NAME=$(head -n 1 ../sites.txt | tr -d '\r\n')
    elif [ -f "sites.txt" ]; then
        SITE_NAME=$(head -n 1 sites.txt | tr -d '\r\n')
    else
        log_error "No site specified and sites.txt not found!"
        exit 1
    fi
fi

# Determine target directory
if [ -d "../public/reorg/$SITE_NAME" ]; then
    TARGET_DIR="../public/reorg/$SITE_NAME"
elif [ -d "public/reorg/$SITE_NAME" ]; then
    TARGET_DIR="public/reorg/$SITE_NAME"
else
    log_error "Target directory not found: public/reorg/$SITE_NAME"
    exit 1
fi

echo ""
echo "=========================================="
echo "  Fix 404 CSS/JS Filenames"
echo "=========================================="
echo "Site: $SITE_NAME"
echo "Target: $TARGET_DIR"
echo ""

# Check if 404.html exists
if [ ! -f "$TARGET_DIR/errors/404.html" ]; then
    log_error "404.html not found at: $TARGET_DIR/errors/404.html"
    exit 1
fi

log_info "Analyzing 404.html CSS/JS references..."
echo ""

# Extract CSS/JS filenames from 404.html
CSS_FILES=$(grep -o 'href="/css/[^"]*\.css' "$TARGET_DIR/errors/404.html" | sed 's|href="/css/||' || true)
JS_FILES=$(grep -o 'src="/js/[^"]*\.js' "$TARGET_DIR/errors/404.html" | sed 's|src="/js/||' || true)

SYMLINKS_CREATED=0
MISSING_FILES=0

# Process CSS files
if [ -n "$CSS_FILES" ]; then
    log_info "Checking CSS files..."
    echo "$CSS_FILES" | while read -r css_file; do
        # Remove query parameters
        css_base=$(echo "$css_file" | sed 's/?.*//')
        
        if [ -f "$TARGET_DIR/css/$css_base" ]; then
            echo "  ✓ $css_base exists"
        else
            echo "  ✗ $css_base NOT FOUND"
            
            # Try to find similar file (case-insensitive match)
            similar=$(find "$TARGET_DIR/css/" -maxdepth 1 -iname "$(basename "$css_base")" 2>/dev/null | head -1)
            
            if [ -n "$similar" ]; then
                similar_name=$(basename "$similar")
                log_info "Creating symlink: $css_base -> $similar_name"
                cd "$TARGET_DIR/css"
                ln -sf "$similar_name" "$css_base" 2>/dev/null || true
                cd - > /dev/null
                ((SYMLINKS_CREATED++))
            else
                ((MISSING_FILES++))
                log_warning "No similar file found for: $css_base"
            fi
        fi
    done
fi

echo ""

# Process JS files
if [ -n "$JS_FILES" ]; then
    log_info "Checking JS files..."
    echo "$JS_FILES" | while read -r js_file; do
        # Remove query parameters
        js_base=$(echo "$js_file" | sed 's/?.*//')
        
        if [ -f "$TARGET_DIR/js/$js_base" ]; then
            echo "  ✓ $js_base exists"
        else
            echo "  ✗ $js_base NOT FOUND"
            
            # Try to find similar file (case-insensitive match)
            similar=$(find "$TARGET_DIR/js/" -maxdepth 1 -iname "$(basename "$js_base")" 2>/dev/null | head -1)
            
            if [ -n "$similar" ]; then
                similar_name=$(basename "$similar")
                log_info "Creating symlink: $js_base -> $similar_name"
                cd "$TARGET_DIR/js"
                ln -sf "$similar_name" "$js_base" 2>/dev/null || true
                cd - > /dev/null
                ((SYMLINKS_CREATED++))
            else
                ((MISSING_FILES++))
                log_warning "No similar file found for: $js_base"
            fi
        fi
    done
fi

echo ""
echo "=========================================="
echo "  Summary"
echo "=========================================="
echo "Symlinks created: $SYMLINKS_CREATED"
echo "Missing files: $MISSING_FILES"
echo ""

if [ $MISSING_FILES -gt 0 ]; then
    log_warning "Some files are still missing"
    log_info "Recommendation: Re-run the full migration to capture 404 page with HTTrack"
    echo ""
    echo "To re-run migration with 404 page:"
    echo "  ./migrate.sh"
    echo ""
else
    log_success "All CSS/JS files are now accessible!"
    log_success "404.html should now load correctly"
fi

echo "=========================================="
echo ""

exit 0


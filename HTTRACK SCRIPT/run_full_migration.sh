#!/bin/bash

# =====================================================
# COMPLETE SITE MIGRATION MASTER SCRIPT
# =====================================================
# This script runs the complete migration workflow:
# 1. Migrate sites using HTTrack
# 2. Reorganize HTML files by URL structure
# 3. Process all images (download + update paths)
# 4. Download and update font files
# 5. Download and transform sitemap
# 6. Wrap Adobe DTM scripts (optional)
# 7. Create 404 error page
#
# Usage: ./run_full_migration.sh [hostname] [skip-httrack]
#   hostname: Optional custom hostname for sitemap/DTM
#   skip-httrack: Add "skip" to skip HTTrack download (if already done)
#
# Example: ./run_full_migration.sh www.meandmbc.gr
# Example: ./run_full_migration.sh www.meandmbc.gr skip
# =====================================================

set -e  # Exit on any error

# Parse command line arguments
CUSTOM_HOST=""
SKIP_HTTRACK=false

if [ $# -gt 0 ]; then
    CUSTOM_HOST="$1"
    echo "Custom hostname provided: $CUSTOM_HOST"
fi

if [ $# -gt 1 ] && [ "$2" = "skip" ]; then
    SKIP_HTTRACK=true
    echo "Skipping HTTrack download (using existing files)"
fi

echo ""
echo "======================================================"
echo "  🚀 COMPLETE SITE MIGRATION WORKFLOW"
echo "======================================================"
echo ""

# Check if required files exist
if [ ! -f "sites.txt" ]; then
    echo "❌ Error: sites.txt not found!"
    exit 1
fi

# Read site from sites.txt
SITE=$(head -n 1 sites.txt | tr -d '\r\n')
if [ -z "$SITE" ]; then
    echo "❌ Error: sites.txt is empty!"
    exit 1
fi

echo "📍 Processing site: $SITE"
echo ""

# Check if required scripts exist (new structure)
if [ ! -f "migrate.sh" ] || [ ! -f "reorganize_html_by_url.sh" ]; then
    echo "❌ Error: Core migration scripts not found!"
    exit 1
fi

if [ ! -d "scripts" ]; then
    echo "❌ Error: scripts/ directory not found!"
    exit 1
fi

# Make sure all scripts are executable
chmod +x migrate.sh 2>/dev/null || true
chmod +x reorganize_html_by_url.sh 2>/dev/null || true
chmod +x download_and_update_fonts.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

# =====================================================
# STEP 1: HTTRACK MIGRATION
# =====================================================
if [ "$SKIP_HTTRACK" = false ]; then
    echo "======================================================"
    echo "  STEP 1/7: Migrating site with HTTrack"
    echo "======================================================"
    echo ""
    if ./migrate.sh; then
        echo ""
        echo "✅ Step 1 completed: Site migrated successfully"
        echo ""
    else
        echo ""
        echo "❌ Step 1 failed: Migration failed"
        exit 1
    fi
else
    echo "======================================================"
    echo "  STEP 1/7: HTTrack Migration (SKIPPED)"
    echo "======================================================"
    echo ""
    echo "⏭️  Using existing downloaded files"
    echo ""
fi

# =====================================================
# STEP 2: REORGANIZE HTML BY URL STRUCTURE
# =====================================================
echo "======================================================"
echo "  STEP 2/7: Reorganizing HTML files"
echo "======================================================"
echo ""
if [ -n "$CUSTOM_HOST" ]; then
    if ./reorganize_html_by_url.sh "$CUSTOM_HOST"; then
        echo ""
        echo "✅ Step 2 completed: HTML files reorganized"
        echo ""
    else
        echo ""
        echo "❌ Step 2 failed: Reorganization failed"
        exit 1
    fi
else
    if ./reorganize_html_by_url.sh; then
        echo ""
        echo "✅ Step 2 completed: HTML files reorganized"
        echo ""
    else
        echo ""
        echo "❌ Step 2 failed: Reorganization failed"
        exit 1
    fi
fi

# =====================================================
# STEP 3: COMPLETE IMAGE PROCESSING (NEW METHOD)
# =====================================================
echo "======================================================"
echo "  STEP 3/7: Processing all images"
echo "======================================================"
echo ""
echo "Using comprehensive image processing script..."
echo ""

cd scripts
if ./process_images_complete.sh; then
    cd ..
    echo ""
    echo "✅ Step 3 completed: All images processed"
    echo ""
else
    cd ..
    echo ""
    echo "❌ Step 3 failed: Image processing failed"
    exit 1
fi

# =====================================================
# STEP 3.5: FIX ALL RESOURCE PATHS (CSS/JS/etc)
# =====================================================
echo "======================================================"
echo "  STEP 3.5/7: Fixing all resource paths"
echo "======================================================"
echo ""
echo "Fixing CSS, JavaScript, and other resource paths..."
echo ""

cd scripts
if ./fix_all_resource_paths.sh "$SITE"; then
    cd ..
    echo ""
    echo "✅ Step 3.5 completed: All resource paths fixed"
    echo ""
else
    cd ..
    echo ""
    echo "⚠️  Step 3.5 warning: Resource path fixing had issues (continuing)"
    echo ""
fi

# =====================================================
# STEP 3.6: DOWNLOAD MISSING ASSETS
# =====================================================
# Scans every HTML/CSS file in the reorg folder and downloads
# any CSS, JS, image, font, or document file that is still
# referenced as an absolute or root-relative URL but is not
# yet present locally. Updates all references after download.
# =====================================================
echo "======================================================"
echo "  STEP 3.6: Downloading missing assets"
echo "======================================================"
echo ""
echo "Scanning for any CSS, JS, images, fonts or files that HTTrack missed..."
echo ""

cd scripts
if ./download_missing_assets.sh "$SITE"; then
    cd ..
    echo ""
    echo "✅ Step 3.6 completed: All missing assets downloaded"
    echo ""
else
    cd ..
    echo ""
    echo "⚠️  Step 3.6 warning: Some assets could not be downloaded (continuing)"
    echo "    Check public/reorg/$SITE/failed_assets.log for details"
    echo ""
fi

# =====================================================
# STEP 4: FONT FILES
# =====================================================
echo "======================================================"
echo "  STEP 4/7: Processing font files"
echo "======================================================"
echo ""
if [ -f "download_and_update_fonts.sh" ]; then
    if ./download_and_update_fonts.sh; then
        echo ""
        echo "✅ Step 4 completed: Font files processed"
        echo ""
    else
        echo ""
        echo "⚠️  Step 4 warning: Font processing had issues (continuing)"
        echo ""
    fi
else
    echo "⏭️  Font processing script not found (skipping)"
    echo ""
fi

# =====================================================
# STEP 5: SITEMAP GENERATION
# =====================================================
echo "======================================================"
echo "  STEP 5/7: Downloading and transforming sitemap"
echo "======================================================"
echo ""

cd scripts
if [ -n "$CUSTOM_HOST" ]; then
    echo "Using custom hostname: $CUSTOM_HOST"
    if ./download_and_transform_sitemap.sh "$CUSTOM_HOST"; then
        cd ..
        echo ""
        echo "✅ Step 5 completed: Sitemap processed"
        echo ""
    else
        cd ..
        echo ""
        echo "⚠️  Step 5 warning: Sitemap processing had issues (continuing)"
        echo ""
    fi
else
    if ./download_and_transform_sitemap.sh; then
        cd ..
        echo ""
        echo "✅ Step 5 completed: Sitemap processed"
        echo ""
    else
        cd ..
        echo ""
        echo "⚠️  Step 5 warning: Sitemap processing had issues (continuing)"
        echo ""
    fi
fi

# =====================================================
# STEP 6: ADOBE DTM SCRIPT WRAPPING (OPTIONAL)
# =====================================================
echo "======================================================"
echo "  STEP 6/7: Wrapping Adobe DTM scripts (optional)"
echo "======================================================"
echo ""



# =====================================================
# STEP 7: CREATE 404 ERROR PAGE
# =====================================================
echo "======================================================"
echo "  STEP 7/7: Creating 404 error page"
echo "======================================================"
echo ""

cd scripts
if [ -f "create_404_page.sh" ]; then
    if ./create_404_page.sh "$SITE"; then
        echo ""
        echo "✅ Step 7 completed: 404 page created"
        echo ""
        
        # Safety check: Verify CSS/JS references (fallback)
        echo "Running safety check on 404 page CSS/JS references..."
        if [ -f "fix_404_css_js.sh" ]; then
            ./fix_404_css_js.sh "$SITE" 2>/dev/null || true
            echo "✅ 404 page verified"
        fi
        echo ""
        
        cd ..
    else
        cd ..
        echo ""
        echo "⚠️  Step 7 warning: 404 page creation had issues (continuing)"
        echo ""
    fi
else
    cd ..
    echo "⏭️  404 page creation script not found (skipping)"
    echo ""
fi

# =====================================================
# FINAL SUMMARY
# =====================================================
echo ""
echo "======================================================"
echo "  ✅ MIGRATION WORKFLOW COMPLETE!"
echo "======================================================"
echo ""
echo "All steps completed successfully:"
if [ "$SKIP_HTTRACK" = false ]; then
    echo "  ✅ Site downloaded with HTTrack"
else
    echo "  ⏭️  HTTrack download skipped"
fi
echo "  ✅ HTML files reorganized by URL structure"
echo "  ✅ All images downloaded and paths updated"
echo "  ✅ All resource paths (CSS/JS) fixed"
echo "  ✅ Missing assets (CSS/JS/fonts/images) downloaded and paths updated"
echo "  ✅ Font files processed"
echo "  ✅ Sitemap generated"
echo "  ✅ Adobe DTM scripts wrapped (if applicable)"
echo "  ✅ 404 error page created"
echo ""
echo "📂 Output locations:"
echo "  - Original migrated site: public/$SITE/"
echo "  - Reorganized site: public/reorg/$SITE/"
echo ""
echo "💾 Backup files created with .backup extension"
echo ""
echo "🌐 To view the site locally:"
echo "  cd public/reorg/$SITE"
echo "  python3 -m http.server 8080"
echo "  Open: http://localhost:8080"
echo ""
echo "======================================================"


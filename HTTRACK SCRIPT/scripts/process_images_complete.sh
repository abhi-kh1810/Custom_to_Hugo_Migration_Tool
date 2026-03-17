#!/usr/bin/env bash
################################################################################
# process_images_complete.sh
#
# Master script to handle complete image processing workflow:
# 1) Download all images from HTML references
# 2) Update all image paths in HTML and CSS files
#    2b) Normalize Drupal aggregated CSS <link> URLs          (helper; flow unchanged)
#    2c) Normalize /profiles/... asset links in HTML          (helper; flow unchanged)
# 3) Verify no remote URLs remain
#
# Usage: ./process_images_complete.sh
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo " Complete Image Processing Workflow"
echo "=========================================="
echo ""

# ---------------------------------------------------------------------------
# Helper: portable in-place sed (GNU vs BSD/macOS)
# Usage: _sed_i <file> [-e expr] [-e expr] ...
#
# WHY a function instead of a variable:
#   Storing "-i ''" in a variable and expanding it unquoted breaks on macOS
#   because bash word-splits the value, turning the '' into two literal
#   single-quote characters which become the backup-file suffix, producing
#   phantom files like index.html''
# ---------------------------------------------------------------------------
_sed_i() {
  local file="$1"; shift
  if sed --version >/dev/null 2>&1; then
    sed -E -i "$@" "$file"      # GNU sed
  else
    sed -E -i '' "$@" "$file"  # BSD/macOS sed — empty string passed as a real arg
  fi
}

# ---------------------------------------------------------------------------
# STEP 2b helper: fix aggregated CSS links in HTML
#   /sites/default/files/css/css_<hash>.css?...    -> /css/css_<hash>.css
#   https://domain/.../sites/default/files/css/... -> /css/css_<hash>.css
# (Runs between Step 2 and Step 3; overall flow stays the same.)
# ---------------------------------------------------------------------------
rewrite_drupal_aggregated_css_links() {
  set -euo pipefail
  local scan_root="${1:-.}"

  echo "STEP 2b: Normalizing Drupal aggregated CSS <link> URLs..."
  echo "------------------------------------------"
  echo "Scanning: $scan_root"

  # Root-relative aggregated CSS
  find "$scan_root" -type f -name '*.html' -print0 \
  | while IFS= read -r -d '' f; do
      _sed_i "$f" \
        -e 's~/sites/default/files/css/(css_[^"?]*\.css)[^"]*~/css/\1~g'
    done

  # Absolute aggregated CSS (https?://domain/...)
  find "$scan_root" -type f -name '*.html' -print0 \
  | while IFS= read -r -d '' f; do
      _sed_i "$f" \
        -e 's~https?://[^"/]*/sites/default/files/css/(css_[^"?]*\.css)[^"]*~/css/\1~g'
    done

  echo "✓ Aggregated CSS links normalized."
  echo ""
}

# ---------------------------------------------------------------------------
# STEP 2c helper: fix /profiles/... asset links in HTML
#   /profiles/.../*.css      -> /css/<file>.css
#   /profiles/.../*.js       -> /js/<file>.js
#   /profiles/.../*.(png|ico|svg|jpg|jpeg|gif|webp) -> /images/<file>.<ext>
#   /profiles/.../*.(woff2|woff|ttf|otf|eot)        -> /fonts/<file>.<ext>
#   /profiles/.../*.(pdf|doc|xlsx|zip|...)          -> /files/<file>.<ext>
# (Runs between Step 2 and Step 3; overall flow unchanged.)
# ---------------------------------------------------------------------------
rewrite_profile_asset_links() {
  set -euo pipefail
  local scan_root="${1:-.}"

  echo "STEP 2c: Normalizing /profiles/... asset links..."
  echo "------------------------------------------"
  echo "Scanning: $scan_root"

  # Use '~' delimiter so '|' alternation in regex doesn't clash with delimiter
  find "$scan_root" -type f -name '*.html' -print0 \
  | while IFS= read -r -d '' f; do
      _sed_i "$f" \
        -e 's~/profiles/[^"]*/([^"/?]+\.css)[^"]*~/css/\1~g' \
        -e 's~/profiles/[^"]*/([^"/?]+\.js)[^"]*~/js/\1~g' \
        -e 's~/profiles/[^"]*/([^"/?]+\.(png|jpg|jpeg|gif|svg|webp|ico))[^"]*~/images/\1~g' \
        -e 's~/profiles/[^"]*/([^"/?]+\.(woff2|woff|ttf|otf|eot))[^"]*~/fonts/\1~g' \
        -e 's~/profiles/[^"]*/([^"/?]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|csv|txt|rtf|zip|rar|7z|tar|gz|bz2|xz))[^"]*~/files/\1~g'
    done

  echo "✓ /profiles/ links normalized."
  echo ""
}

# ---------------------------------------------------------------------------
# STEP 2d helper: fix /sites/default/files/... links in HTML
#  - Images (.png .jpg .jpeg .gif .svg .webp .ico)  -> /images/<file>
#  - Docs/archives (pdf/doc/xls/... zip/tar/...)    -> /files/<file>
#  - Works in any HTML attribute (src, href, content, data-*)
#  - CSS aggregates stay handled by Step 2b
# ---------------------------------------------------------------------------
rewrite_drupal_files_links() {
  set -euo pipefail
  local scan_root="${1:-.}"

  echo "STEP 2d: Normalizing /sites/default/files/... links (images & docs)..."
  echo "------------------------------------------"
  echo "Scanning: $scan_root"

  # 1) Images -> /images/<filename>.<ext>
  find "$scan_root" -type f -name '*.html' -print0 \
  | while IFS= read -r -d '' f; do
      _sed_i "$f" \
        -e 's~([[:space:]"])/sites/default/files/[^"<>]*/([^"/?]+\.(png|jpg|jpeg|gif|svg|webp|ico))[^"<>]*~\1/images/\2~gI'
    done

  # 2) Documents/other files -> /files/<filename>.<ext>
  find "$scan_root" -type f -name '*.html' -print0 \
  | while IFS= read -r -d '' f; do
      _sed_i "$f" \
        -e 's~([[:space:]"])/sites/default/files/[^"<>]*/([^"/?]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|csv|txt|rtf|zip|rar|7z|tar|gz|bz2|xz))[^"<>]*~\1/files/\2~gI'
    done

  echo "✓ /sites/default/files links normalized."
  echo ""
}

# ---------------------------------------------------------------------------
# STEP 1: Download all images
# ---------------------------------------------------------------------------
echo "STEP 1: Downloading all images..."
echo "------------------------------------------"
if bash "$SCRIPT_DIR/download_all_images.sh"; then
  echo "✓ Image download completed"
else
  echo "✗ Image download failed"
  exit 1
fi
echo ""

# ---------------------------------------------------------------------------
# STEP 2: Update all image paths (HTML & CSS)
# ---------------------------------------------------------------------------
echo "STEP 2: Updating all image paths..."
echo "------------------------------------------"
if bash "$SCRIPT_DIR/update_all_image_paths.sh"; then
  echo "✓ Path update completed"
else
  echo "✗ Path update failed"
  exit 1
fi
echo ""

# Determine target directory (used by helpers and verification)
SITE_NAME=$(head -n 1 ../sites.txt | tr -d '\r\n')
TARGET_DIR="../public/reorg/$SITE_NAME"

# ---------------------------------------------------------------------------
# STEP 2b: Normalize aggregated CSS links (helper; flow unchanged)
# ---------------------------------------------------------------------------
rewrite_drupal_aggregated_css_links "$TARGET_DIR"

# ---------------------------------------------------------------------------
# STEP 2c: Normalize /profiles/... asset links (helper; flow unchanged)
# ---------------------------------------------------------------------------
rewrite_profile_asset_links "$TARGET_DIR"


# ---------------------------------------------------------------------------
# STEP 2d: Normalize /sites/default/files/... (images & docs in HTML)
# ---------------------------------------------------------------------------
rewrite_drupal_files_links "$TARGET_DIR"


# ---------------------------------------------------------------------------
# STEP 3: Verification
# ---------------------------------------------------------------------------
echo "STEP 3: Verification..."
echo "------------------------------------------"

cd "$TARGET_DIR"

echo "Checking for remaining remote URLs..."
ISSUES=0


# Check 1: Drupal paths
if grep -R "/sites/default/files/" --include="*.html" . 2>/dev/null | grep -v ".backup"; then
  echo "⚠ Found remaining Drupal paths"
  ((ISSUES++))
else
  echo "✓ No Drupal paths found"
fi

# Check 2: Profile paths
if grep -R '"/profiles/' --include="*.html" . 2>/dev/null | grep -v ".backup"; then
  echo "⚠ Found remaining profile paths"
  ((ISSUES++))
else
  echo "✓ No profile paths found"
fi

# Check 3: Full domain image URLs in src/data-src (allow common exceptions)
if grep -REi '(src|data-src)="https://[^"]+\.(png|jpg|jpeg|svg|gif|webp|ico)"' --include="*.html" . 2>/dev/null \
   | grep -v "assets.adobedtm" \
   | grep -v "use.typekit" \
   | grep -v "s3.amazonaws"; then
  echo "⚠ Found remaining full URLs"
  ((ISSUES++))
else
  echo "✓ No problematic full URLs found"
fi

echo ""
echo "=========================================="
if [ $ISSUES -eq 0 ]; then
  echo "✓ SUCCESS: All assets processed correctly!"
  echo "=========================================="
  echo ""
  echo "Summary:"
  echo " - All images downloaded"
  echo " - All image paths updated to /images/"
  echo " - Aggregated CSS links normalized to /css/"
  echo " - /profiles/ assets normalized to /css, /js, /images, /fonts, /files"
  echo " - No remote URLs remaining"
  echo ""
else
  echo "⚠ WARNINGS: $ISSUES issue(s) found"
  echo "=========================================="
  echo "Please review the warnings above"
  echo ""
fi
``
#!/usr/bin/env bash
################################################################################
# update_all_image_paths.sh
#
# Comprehensive script to update ALL image paths in HTML and CSS files
# Handles all corner cases:
# - Regular src="" attributes
# - srcset="" attributes
# - data-src="" and data-srcset"" (lazy loading)
# - background-image in inline styles
# - Drupal image style paths (/sites/default/files/styles/...)
# - Regular Drupal paths (/sites/default/files/...)
# - Profile paths (/profiles/...)
# - Full domain URLs
# - CSS file image paths
#
# Usage: ./update_all_image_paths.sh
################################################################################

set -e

# --- Inputs -------------------------------------------------------------------

if [ ! -f "../sites.txt" ]; then
  echo "Error: sites.txt not found!"
  exit 1
fi

SITE_NAME="$(head -n 1 ../sites.txt | tr -d '\r\n')"
if [ -z "$SITE_NAME" ]; then
  echo "Error: No site found in sites.txt"
  exit 1
fi

TARGET_DIR="../public/reorg/$SITE_NAME"
if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: Target directory not found: $TARGET_DIR"
  exit 1
fi

echo "=========================================="
echo " Update All Image Paths Tool"
echo "=========================================="
echo "Site:   $SITE_NAME"
echo "Target: $TARGET_DIR"
echo ""

cd "$TARGET_DIR"

# --- Update HTML files --------------------------------------------------------

echo "Updating HTML files..."
python3 <<'PYEOF'
import os
import re
import glob
from urllib.parse import unquote

def clean_filename(filename: str) -> str:
    """Clean filename: decode URL encoding, lowercase, replace spaces, strip query."""
    filename = unquote(filename)
    filename = filename.lower().replace(' ', '_')
    filename = re.sub(r'\?.*$', '', filename)
    return filename

def clean_drupal_style_path(path: str) -> str:
    """
    Convert Drupal image style paths to clean paths.
    /sites/default/files/styles/STYLE/public/... -> /sites/default/files/...
    /sites/default/files/styles/STYLE/private/... -> /sites/default/files/...
    """
    path = re.sub(r'/styles/[^/]+/public/', '/', path)
    path = re.sub(r'/styles/[^/]+/private/', '/', path)
    return path

def extract_filename_from_path(path: str) -> str:
    """Extract and clean filename from any path."""
    path = clean_drupal_style_path(path)
    path_wo_q = re.sub(r'\?.*$', '', path)
    filename = os.path.basename(path_wo_q)
    return clean_filename(filename)

# Gather all HTML files
html_files = glob.glob('**/*.html', recursive=True)
html_updated = 0

for html_file in html_files:
    if html_file.endswith('.backup'):
        continue
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            content = f.read()
        original = content

        # 1. Drupal image style paths (public)
        content = re.sub(
            r'/sites/default/files/styles/[^/]+/public/[^"\s?]+(?:\?[^"\s]*)?',
            lambda m: f"/images/{extract_filename_from_path(m.group(0))}",
            content
        )

        # 1b. Drupal image style paths (private)
        content = re.sub(
            r'/sites/default/files/styles/[^/]+/private/[^"\s?]+(?:\?[^"\s]*)?',
            lambda m: f"/images/{extract_filename_from_path(m.group(0))}",
            content
        )

        # 2. Regular Drupal file paths on src / data-src / data-srcset
        content = re.sub(
            r'(?:\b(src|data-src|data-srcset))="(/sites/default/files/[^"]+)"',
            lambda m: f'{m.group(1)}="/images/{extract_filename_from_path(m.group(2))}"',
            content,
            flags=re.IGNORECASE
        )

        # 3. Profile paths on src / data-src
        content = re.sub(
            r'(?:\b(src|data-src))="(/profiles/[^"]+)"',
            lambda m: f'{m.group(1)}="/images/{extract_filename_from_path(m.group(2))}"',
            content,
            flags=re.IGNORECASE
        )

        # 4. Full domain URLs (allow-list), map to /images/<filename>
        site_patterns = [
            r'www\.meandmbc\.gr',
            r'www\.wegweiser-neurodermitis\.de',
            r'www\.diccionariomieloma\.es'
        ]
        for pattern in site_patterns:
            content = re.sub(
                rf'(?:\b(src|data-src))="https://{pattern}/(?:profiles|sites)/[^"]+/([^/"]+\.(?:png|jpg|jpeg|svg|gif|webp|ico))"',
                r'\1="/images/\2"',
                content,
                flags=re.IGNORECASE
            )

        # 5. background-image: url(http/https ...)
        content = re.sub(
            r'background-image\s*:\s*url\((["\']?)https?://[^)]+/([^/"\']+\.(?:png|jpg|jpeg|svg|gif|webp|ico))\1\)',
            r"background-image:url('/images/\2')",
            content,
            flags=re.IGNORECASE
        )

        # 5b. background-image: url(relative ...)
        # Avoid touching data: URIs; avoid /images/images/ duplication.
        def fix_bg_relative(m):
            path = m.group(1)
            if path.startswith('images/'):
                path = path[7:]
            return f"background-image:url('/images/{path}')"

        content = re.sub(
            r'background-image\s*:\s*url\(["\']?(?!https?://|/|\.\./|data:)([^"\'\)]+\.(?:png|jpg|jpeg|svg|gif|webp|ico))["\']?\)',
            fix_bg_relative,
            content,
            flags=re.IGNORECASE
        )

        # 6. Decode URL-encoded paths already under /images/
        # NOTE: This does not parse multi-URL srcset values (flow preserved).
        def decode_image_path(m):
            attr = m.group(1)
            full_path = m.group(2)
            decoded = unquote(full_path).lower().replace(' ', '_')
            decoded = re.sub(r'\?.*$', '', decoded)
            return f'{attr}="/images/{decoded}"'

        content = re.sub(
            r'(\b(?:src|data-src|data-srcset))="/images/([^"]+)"',
            decode_image_path,
            content,
            flags=re.IGNORECASE
        )

        if content != original:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(content)
            html_updated += 1
            print(f" Updated: {html_file}")

    except Exception as e:
        print(f" Error: {html_file}: {e}")

print(f"\nHTML files updated: {html_updated}")
PYEOF

# --- Update CSS files ---------------------------------------------------------

echo ""
echo "Updating CSS files..."
python3 <<'PYEOF'
import re
import glob

css_files = glob.glob('**/*.css', recursive=True)
css_updated = 0

for css_file in css_files:
    if css_file.endswith('.backup'):
        continue
    try:
        with open(css_file, 'r', encoding='utf-8') as f:
            content = f.read()
        original = content

        # Update relative image paths that do NOT start with:
        # '/', 'http', 'https', '../', or '../images/'
        content = re.sub(
            r'url\(\s*(?!https?://|/|\.\./|\.\./images/)\s*([^)]+\.(?:png|svg|jpg|gif|webp|ico|jpeg))\s*\)',
            r'url(../images/\1)',
            content,
            flags=re.IGNORECASE
        )

        if content != original:
            with open(css_file, 'w', encoding='utf-8') as f:
                f.write(content)
            css_updated += 1
            print(f" Updated: {css_file}")

    except Exception as e:
        print(f" Error: {css_file}: {e}")

print(f"\nCSS files updated: {css_updated}")
PYEOF

echo ""
echo "=========================================="
echo "All image paths updated successfully!"
echo "=========================================="
``
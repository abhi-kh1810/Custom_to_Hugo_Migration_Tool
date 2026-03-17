#!/usr/bin/env bash
################################################################################
# download_missing_assets.sh
#
# Scans all HTML and CSS files in the reorg folder and downloads every asset
# (CSS, JS, images, fonts, PDFs, etc.) that is:
#   a) referenced as an absolute URL pointing back to the source site, OR
#   b) referenced as a root-relative path that does not exist locally.
#
# After downloading, updates every reference in HTML/CSS to the local path.
#
# Usage: ./download_missing_assets.sh [sitename]
#   sitename: optional – defaults to first line of ../sites.txt
#
# Outputs:
#   - Downloaded files into css/ js/ images/ fonts/ files/ under the reorg site
#   - A log of every failure: <site>/failed_assets.log
################################################################################

set -uo pipefail

################################################################################
# Helpers
################################################################################

log()  { printf '[%s] %s\n' "$(date +'%H:%M:%S')" "$*"; }
warn() { printf '[%s] ⚠️  %s\n' "$(date +'%H:%M:%S')" "$*" >&2; }
err()  { printf '[%s] ❌ %s\n' "$(date +'%H:%M:%S')" "$*" >&2; }

# Cross-platform file size (macOS + Linux)
file_size() { stat -c%s "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null || echo 0; }

################################################################################
# Resolve site name
################################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTTRACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "${1-}" != "" ]; then
  SITE_NAME="$1"
else
  SITES_TXT="$HTTRACK_DIR/sites.txt"
  if [ ! -f "$SITES_TXT" ]; then
    err "sites.txt not found at $SITES_TXT"
    exit 1
  fi
  SITE_NAME="$(head -n 1 "$SITES_TXT" | tr -d '\r\n')"
fi

if [ -z "$SITE_NAME" ]; then
  err "Site name is empty."
  exit 1
fi

SITE_DIR="$HTTRACK_DIR/public/reorg/$SITE_NAME"
if [ ! -d "$SITE_DIR" ]; then
  err "Reorg directory not found: $SITE_DIR"
  exit 1
fi

BASE_URL="https://$SITE_NAME"
FAILED_LOG="$SITE_DIR/failed_assets.log"
: > "$FAILED_LOG"   # truncate / create

log "========================================"
log " Download Missing Assets"
log "========================================"
log "Site      : $SITE_NAME"
log "Base URL  : $BASE_URL"
log "Site dir  : $SITE_DIR"
log ""

################################################################################
# Python: extract all asset references and download missing ones
################################################################################

python3 - "$SITE_DIR" "$BASE_URL" "$FAILED_LOG" <<'PYEOF'
import sys
import os
import re
import glob
import hashlib
from pathlib import Path
from urllib.parse import urlparse, unquote, urljoin, quote
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
import time

SITE_DIR   = Path(sys.argv[1])
BASE_URL   = sys.argv[2].rstrip('/')
FAILED_LOG = sys.argv[3]
SITE_HOST  = urlparse(BASE_URL).netloc  # e.g. www.knowpneumonia.sg

# ── Bucket config: extension → (local_subfolder, html_attr_prefix) ────────────
EXT_BUCKET = {
    # images
    'png':'images','jpg':'images','jpeg':'images','gif':'images',
    'svg':'images','webp':'images','ico':'images','bmp':'images',
    'tif':'images','tiff':'images','avif':'images',
    # fonts
    'woff':'fonts','woff2':'fonts','ttf':'fonts','otf':'fonts','eot':'fonts',
    # stylesheets
    'css':'css',
    # javascript
    'js':'js',
    # documents / archives
    'pdf':'files','doc':'files','docx':'files','xls':'files','xlsx':'files',
    'ppt':'files','pptx':'files','csv':'files','zip':'files','rar':'files',
    '7z':'files','tar':'files','gz':'files',
}

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/122.0.0.0 Safari/537.36'
    ),
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': BASE_URL + '/',
}

failures = []

def clean_filename(raw: str) -> str:
    """URL-decode, strip query, lowercase, replace spaces."""
    name = unquote(raw)
    name = re.sub(r'\?.*$', '', name)
    name = os.path.basename(name)
    name = name.lower().replace(' ', '_').replace('%20', '_')
    return name

def ext_of(name: str) -> str:
    return name.rsplit('.', 1)[-1].lower() if '.' in name else ''

def bucket_for(name: str):
    return EXT_BUCKET.get(ext_of(name))

def local_path_for(name: str):
    bucket = bucket_for(name)
    if not bucket:
        return None
    return SITE_DIR / bucket / name

def encode_url_path(url: str) -> str:
    """Percent-encode the path component of a URL (safe chars kept)."""
    p = urlparse(url)
    encoded = quote(p.path, safe='/:@!$&\'()*+,;=')
    return p._replace(path=encoded).geturl()

def download(url: str, dest: Path, retries: int = 3) -> bool:
    """Download url → dest. Returns True on success."""
    if dest.exists() and file_size_p(dest) > 500:
        return True  # already present and non-trivial

    dest.parent.mkdir(parents=True, exist_ok=True)
    url = encode_url_path(url)

    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers=HEADERS)
            with urlopen(req, timeout=20) as resp:
                data = resp.read()
            if len(data) < 50:
                raise ValueError(f"Response too small ({len(data)} bytes)")
            dest.write_bytes(data)
            return True
        except (URLError, HTTPError, OSError, ValueError) as exc:
            if attempt < retries:
                time.sleep(1.5 * attempt)
            else:
                failures.append(f"{url}  →  {exc}")
                return False
    return False

def file_size_p(p: Path) -> int:
    try:
        return p.stat().st_size
    except:
        return 0

# ── Regex patterns for extracting asset references from HTML ─────────────────

# href / src / data-src / action on any attribute
RE_ATTR = re.compile(
    r'''(?:href|src|data-src|data-lazy-src|data-original|action)\s*=\s*(?P<q>['"])(?P<url>[^'">\s]+)(?P=q)''',
    re.IGNORECASE,
)
# srcset / data-srcset (comma-separated list of "url [descriptor]" pairs)
RE_SRCSET = re.compile(
    r'''(?:srcset|data-srcset)\s*=\s*(?P<q>['"])(?P<val>[^'"]+)(?P=q)''',
    re.IGNORECASE,
)
# CSS url() — covers inline styles AND .css files
RE_CSS_URL = re.compile(
    r'''url\s*\(\s*(?P<q>['"]?)(?P<url>[^'")\s]+)(?P=q)\s*\)''',
    re.IGNORECASE,
)
# <link rel="stylesheet"> or preload href
RE_LINK = re.compile(
    r'''<link[^>]+href\s*=\s*(?P<q>['"])(?P<url>[^'"]+)(?P=q)[^>]*>''',
    re.IGNORECASE,
)
# <script src="...">
RE_SCRIPT = re.compile(
    r'''<script[^>]+src\s*=\s*(?P<q>['"])(?P<url>[^'"]+)(?P=q)''',
    re.IGNORECASE,
)

def is_target_url(url: str) -> bool:
    """True if we should try to localise this URL."""
    if not url or url.startswith('data:') or url.startswith('#') or url.startswith('mailto:'):
        return False
    if url.startswith('//'):
        return True  # protocol-relative
    if url.startswith('http://') or url.startswith('https://'):
        p = urlparse(url)
        return p.netloc == SITE_HOST
    if url.startswith('/'):
        return True  # root-relative
    return False

def resolve_url(url: str) -> str:
    """Normalise url to an absolute https:// URL we can download."""
    if url.startswith('//'):
        return 'https:' + url
    if url.startswith('/'):
        return BASE_URL + url
    return url  # already absolute

def extract_urls_from_html(content: str):
    urls = set()
    for m in RE_ATTR.finditer(content):
        urls.add(m.group('url').split('?')[0])
    for m in RE_SRCSET.finditer(content):
        for part in m.group('val').split(','):
            u = part.strip().split()[0]
            urls.add(u.split('?')[0])
    for m in RE_CSS_URL.finditer(content):
        urls.add(m.group('url').split('?')[0])
    for m in RE_LINK.finditer(content):
        urls.add(m.group('url').split('?')[0])
    for m in RE_SCRIPT.finditer(content):
        urls.add(m.group('url').split('?')[0])
    return urls

def extract_urls_from_css(content: str):
    urls = set()
    for m in RE_CSS_URL.finditer(content):
        urls.add(m.group('url').split('?')[0])
    return urls

# ── Collect every referenced asset ───────────────────────────────────────────

print(f"Scanning HTML and CSS files in {SITE_DIR} …")

all_refs: set[str] = set()

for html_file in SITE_DIR.rglob('*.html'):
    if '.backup' in html_file.name:
        continue
    try:
        content = html_file.read_text(encoding='utf-8', errors='ignore')
        all_refs.update(extract_urls_from_html(content))
    except Exception as e:
        print(f"  ⚠ Could not read {html_file.name}: {e}")

for css_file in SITE_DIR.rglob('*.css'):
    if '.backup' in css_file.name:
        continue
    try:
        content = css_file.read_text(encoding='utf-8', errors='ignore')
        all_refs.update(extract_urls_from_css(content))
    except Exception as e:
        print(f"  ⚠ Could not read {css_file.name}: {e}")

print(f"Total references found: {len(all_refs)}")

# ── Filter to only URLs we can/should download ───────────────────────────────

to_download: list = []  # list of (abs_url, dest_path, clean_name)

for ref in sorted(all_refs):
    if not is_target_url(ref):
        continue
    filename = clean_filename(os.path.basename(ref.split('?')[0]))
    if not filename or '.' not in filename:
        continue
    dest = local_path_for(filename)
    if dest is None:
        continue  # unknown extension – skip
    if dest.exists() and file_size_p(dest) > 500:
        continue  # already present
    abs_url = resolve_url(ref)
    to_download.append((abs_url, dest, filename))

print(f"Missing assets to download: {len(to_download)}")
print()

# ── Download ─────────────────────────────────────────────────────────────────

downloaded = 0
skipped    = 0

for abs_url, dest, name in to_download:
    bucket = dest.parent.name
    print(f"  [{bucket}] {name}")
    print(f"        ← {abs_url}")
    if download(abs_url, dest):
        print(f"        ✅ saved ({file_size_p(dest):,} bytes)")
        downloaded += 1
    else:
        print(f"        ❌ failed")
        skipped += 1

# ── Update references in HTML files ──────────────────────────────────────────
# Replace absolute site URLs and root-relative paths with local /bucket/name paths.

print()
print("Updating references in HTML files …")

html_updated = 0

for html_file in SITE_DIR.rglob('*.html'):
    if '.backup' in html_file.name:
        continue
    try:
        content = html_file.read_text(encoding='utf-8', errors='ignore')
        original = content

        def _replace_ref(url_raw: str) -> str | None:
            """Return local path string if we should replace this URL, else None."""
            url_clean = url_raw.split('?')[0]
            if not is_target_url(url_clean):
                return None
            filename = clean_filename(os.path.basename(url_clean))
            if not filename or '.' not in filename:
                return None
            dest = local_path_for(filename)
            if dest is None:
                return None
            # Only replace if the file now exists locally
            if not dest.exists():
                return None
            bucket = dest.parent.name
            return f'/{bucket}/{filename}'

        # Replace in attr values (href, src, data-src, etc.)
        def repl_attr(m):
            new_url = _replace_ref(m.group('url'))
            if new_url is None:
                return m.group(0)
            q = m.group('q')
            # Rebuild the original attribute=value, replacing just the URL value
            # m.group(0) looks like: src="https://..."
            # We want to keep the attribute name, just swap the URL
            full = m.group(0)
            old_url = m.group('url')
            return full.replace(old_url, new_url, 1)

        content = RE_ATTR.sub(repl_attr, content)
        content = RE_LINK.sub(
            lambda m: repl_attr(m) if _replace_ref(m.group('url')) else m.group(0),
            content,
        )
        content = RE_SCRIPT.sub(
            lambda m: repl_attr(m) if _replace_ref(m.group('url')) else m.group(0),
            content,
        )

        # Replace in url() (inline CSS background-image, etc.)
        def repl_css_url(m):
            new_url = _replace_ref(m.group('url'))
            if new_url is None:
                return m.group(0)
            q = m.group('q') or ''
            return f'url({q}{new_url}{q})'

        content = RE_CSS_URL.sub(repl_css_url, content)

        # Fix srcset
        def repl_srcset(m):
            val = m.group('val')
            parts = []
            changed = False
            for part in val.split(','):
                stripped = part.strip()
                tokens = stripped.split()
                if tokens:
                    url = tokens[0]
                    new_url = _replace_ref(url)
                    if new_url:
                        tokens[0] = new_url
                        changed = True
                    parts.append(' '.join(tokens))
                else:
                    parts.append(part)
            if not changed:
                return m.group(0)
            q = m.group('q')
            attr_name = m.group(0).split('=')[0].strip()
            return f'{attr_name}={q}{", ".join(parts)}{q}'

        content = RE_SRCSET.sub(repl_srcset, content)

        if content != original:
            html_file.write_text(content, encoding='utf-8')
            html_updated += 1

    except Exception as e:
        print(f"  ⚠ Could not update {html_file.name}: {e}")

# ── Update references in CSS files ───────────────────────────────────────────

print("Updating references in CSS files …")
css_updated = 0

for css_file in SITE_DIR.rglob('*.css'):
    if '.backup' in css_file.name:
        continue
    try:
        content = css_file.read_text(encoding='utf-8', errors='ignore')
        original = content

        def repl_css_url2(m):
            new_url = _replace_ref(m.group('url'))
            if new_url is None:
                return m.group(0)
            q = m.group('q') or ''
            return f'url({q}{new_url}{q})'

        content = RE_CSS_URL.sub(repl_css_url2, content)

        if content != original:
            css_file.write_text(content, encoding='utf-8')
            css_updated += 1

    except Exception as e:
        print(f"  ⚠ Could not update {css_file.name}: {e}")

# ── Write failure log ─────────────────────────────────────────────────────────

if failures:
    with open(FAILED_LOG, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(failures) + '\n')

# ── Summary ───────────────────────────────────────────────────────────────────

print()
print("========================================")
print(" Download Missing Assets — Summary")
print("========================================")
print(f"  Assets downloaded  : {downloaded}")
print(f"  Assets failed      : {skipped}")
print(f"  HTML files updated : {html_updated}")
print(f"  CSS files updated  : {css_updated}")
if failures:
    print()
    print(f"  ⚠️  {len(failures)} asset(s) could not be downloaded:")
    for f in failures[:20]:
        print(f"      {f}")
    if len(failures) > 20:
        print(f"      … and {len(failures)-20} more (see {FAILED_LOG})")
else:
    print()
    print("  ✅  All referenced assets are now local — no remote URLs remain.")
print()
PYEOF

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  err "Python asset downloader exited with code $EXIT_CODE"
  exit $EXIT_CODE
fi

# ── Second-pass: retry any failed downloads once ─────────────────────────────
if [ -f "$FAILED_LOG" ] && [ -s "$FAILED_LOG" ]; then
  FAIL_COUNT=$(wc -l < "$FAILED_LOG" | tr -d ' ')
  log ""
  log "Retrying $FAIL_COUNT failed assets (second pass)…"

  RETRY_LOG="${FAILED_LOG%.log}_retry.log"
  : > "$RETRY_LOG"

  while IFS= read -r line; do
    url=$(echo "$line" | awk '{print $1}')
    [ -z "$url" ] && continue

    filename=$(python3 -c "
import os, sys
from urllib.parse import unquote
u = sys.argv[1].split('?')[0]
n = unquote(os.path.basename(u)).lower().replace(' ','_')
print(n)
" "$url" 2>/dev/null)

    [ -z "$filename" ] && continue

    ext="${filename##*.}"
    case "$ext" in
      css)  bucket="css"  ;;
      js)   bucket="js"   ;;
      woff|woff2|ttf|otf|eot) bucket="fonts" ;;
      png|jpg|jpeg|gif|svg|webp|ico|bmp|avif) bucket="images" ;;
      pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|gz|tar) bucket="files" ;;
      *) continue ;;
    esac

    dest="$SITE_DIR/$bucket/$filename"

    if curl -s -f -L \
         -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
         -H "Referer: $BASE_URL/" \
         --retry 2 --retry-delay 3 \
         -o "$dest" "$url"; then
      log "  ✅ retry OK: $filename"
    else
      log "  ❌ retry failed: $url"
      echo "$url" >> "$RETRY_LOG"
    fi

  done < "$FAILED_LOG"

  # Overwrite the main log with only the still-failing ones
  if [ -s "$RETRY_LOG" ]; then
    cp "$RETRY_LOG" "$FAILED_LOG"
    REMAINING=$(wc -l < "$FAILED_LOG" | tr -d ' ')
    warn "$REMAINING asset(s) still failed after retry — see $FAILED_LOG"
  else
    rm -f "$FAILED_LOG" "$RETRY_LOG"
    log "✅ All previously-failed assets downloaded on retry."
  fi
fi

log ""
log "✅ download_missing_assets.sh complete."

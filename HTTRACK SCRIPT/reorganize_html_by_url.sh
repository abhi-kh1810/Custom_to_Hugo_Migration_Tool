#!/usr/bin/env bash
# Reorganize HTTrack HTML mirrors into clean URL structure with normalized assets and sitemap.
# Portable on GNU/Linux and macOS (BSD sed). Safe for spaces in paths. Root-relative link strategy.

set -euo pipefail

########################################
#             CONFIGURATION            #
########################################

# Where your ORIGINAL HTTrack mirror lives (change this to your input)
SRC_ROOT="public"

# Where the reorganized site should be written
DST_ROOT="public/reorg"

# Behavior flags
SKIP_PHP_URLS=true        # true: don't convert pages whose HTTrack URL contains .php
MOVE_FROM_IMAGES=true     # true: move *.css/*.js/*.pdf out of images/ to css/js/files

# Input list of sites (one per line; each must exist as ${SRC_ROOT}/<site>)
SITES_FILE="sites.txt"

# Optional: pass a custom hostname for sitemap generation (e.g., example.org)
CUSTOM_HOST="${1-}"

########################################
#                 UTIL                 #
########################################

log()   { printf '%s\n' "[$(date +'%H:%M:%S')] $*"; }
warn()  { printf '%s\n' "[$(date +'%H:%M:%S')] WARNING: $*" >&2; }
err()   { printf '%s\n' "[$(date +'%H:%M:%S')] ERROR: $*" >&2; }

# Portable in-place sed (GNU vs BSD/macOS)
# Usage: sed_i '<script>' <file>
sed_i() {
  local script="$1" file="$2"
  if sed --version >/dev/null 2>&1; then
    sed -i "${script}" "$file"      # GNU sed
  else
    sed -i '' "${script}" "$file"   # BSD/macOS sed
  fi
}

# Trim leading/trailing whitespace
trim() {
  local s="${1-}"
  echo "$(echo "$s" | sed -e 's/^[[:space:]]\+//' -e 's/[[:space:]]\+$//')"
}

# Extract original mirrored URL from the first HTTrack comment in a file. Empty if not found.
extract_httrack_url() {
  local file="$1"
  # Looks for: <!-- Mirrored from <URL> by HTTrack -->
  grep -ao '<!-- Mirrored from [^ ]\+ by HTTrack' "$file" 2>/dev/null \
    | head -n1 \
    | sed -E 's/^<!-- Mirrored from ([^ ]+) by HTTrack$/\1/'
}

# Convert absolute URL to path (strip protocol + domain)
# https://www.site.com/de/page -> 'de/page' | http://site.com/ -> '' | site.com/foo -> 'foo'
url_to_path() {
  local url="$1"
  url="$(echo "$url" | sed -E 's#^[a-zA-Z]+://##')"   # remove scheme
  url="$(echo "$url" | sed -E 's#^[^/]+/?##')"        # remove domain
  url="$(echo "$url" | sed -E 's#/$##')"              # trim trailing slash
  echo "$url"
}

# Write a <url> entry into sitemap
write_sitemap_url() {
  local file="$1" loc="$2" lastmod="$3" changefreq="$4" priority="$5"
  cat >> "$file" <<EOF
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
EOF
}

# Safe mktemp for Linux/macOS
mktemp_safe() { mktemp 2>/dev/null || mktemp -t tmp; }

########################################
#           PRE-RUN CHECKS             #
########################################

log "Starting HTML reorganization..."
log "======================================"

if [ ! -f "$SITES_FILE" ]; then
  err "Required file '$SITES_FILE' not found."
  exit 1
fi

mkdir -p "$DST_ROOT"
log "✓ Output root ensured at: $DST_ROOT"

########################################
#             MAIN LOGIC               #
########################################

# Read each site from sites.txt (skip empty/comment lines)
while IFS= read -r site || [ -n "${site-}" ]; do
  site="$(trim "$site")"
  [ -z "$site" ] && continue
  case "$site" in \#*) continue ;; esac

  log ""
  log "Processing site: $site"
  log "------------------------------------"

  site_src_dir="${SRC_ROOT}/${site}"
  site_dst_dir="${DST_ROOT}/${site}"

  if [ ! -d "$site_src_dir" ]; then
    warn "Source directory not found: $site_src_dir. Skipping."
    continue
  fi

  # Create destination standard structure
  mkdir -p "$site_dst_dir" "$site_dst_dir/css" "$site_dst_dir/js" \
           "$site_dst_dir/files" "$site_dst_dir/fonts" "$site_dst_dir/images"
  log "✓ Ensured: $site_dst_dir/{css,js,files,fonts,images}"

  ########################################
  #  Copy images & relocate assets       #
  ########################################

  css_moved=0 js_moved=0 pdf_moved=0 fonts_moved=0

  if [ "$MOVE_FROM_IMAGES" = true ] && [ -d "$site_src_dir/images" ]; then
    log "Images folder found at source. Copying to destination and relocating assets..."

    # Copy entire images tree into destination images/ (preserve structure)
    while IFS= read -r -d '' f; do
      rel="${f#$site_src_dir/images/}"
      dst="$site_dst_dir/images/$rel"
      mkdir -p "$(dirname "$dst")"
      cp -p "$f" "$dst"
    done < <(find "$site_src_dir/images" -type f -print0 2>/dev/null)
    log "  ✓ Copied images into: $site_dst_dir/images"

    # Move CSS files from images/
    while IFS= read -r -d '' f; do
      mv -f "$f" "$site_dst_dir/css/"; css_moved=$((css_moved+1))
    done < <(find "$site_dst_dir/images" -type f -name '*.css' -print0 2>/dev/null)

    # Move JS files from images/
    while IFS= read -r -d '' f; do
      mv -f "$f" "$site_dst_dir/js/"; js_moved=$((js_moved+1))
    done < <(find "$site_dst_dir/images" -type f -name '*.js' -print0 2>/dev/null)

    # Move PDF files from images/
    while IFS= read -r -d '' f; do
      mv -f "$f" "$site_dst_dir/files/"; pdf_moved=$((pdf_moved+1))
    done < <(find "$site_dst_dir/images" -type f -name '*.pdf' -print0 2>/dev/null)

    # Move fonts files from images/
    while IFS= read -r -d '' f; do
      mv -f "$f" "$site_dst_dir/fonts/"; fonts_moved=$((fonts_moved+1))
    done < <(find "$site_dst_dir/images" -type f \( -iname '*.woff' -o -iname '*.woff2' -o -iname '*.ttf' -o -iname '*.otf' \) -print0 2>/dev/null)

    if [ $css_moved -eq 0 ] && [ $js_moved -eq 0 ] && [ $pdf_moved -eq 0 ] && [ $fonts_moved -eq 0 ]; then
      log "  No CSS/JS/PDF found inside images/ to relocate."
    else
      log "  Summary: moved $css_moved CSS, $js_moved JS, $pdf_moved PDF $fonts_moved fonts from images/."
    fi
  else
    log "No images relocation needed (either disabled or $site_src_dir/images missing)."
  fi

  # Copy fonts/ if present
  # if [ -d "$site_src_dir/fonts" ]; then
  #  log "Fonts folder found at source. Copying font files..."
  # while IFS= read -r -d '' f; do
  #    cp -p "$f" "$site_dst_dir/fonts/"; fonts_moved=$((fonts_moved+1))
  #  done < <(find "$site_src_dir/fonts" -type f -print0 2>/dev/null)
  #  if [ $fonts_moved -gt 0 ]; then
  #    log "  ✓ Copied $fonts_moved font files → $site_dst_dir/fonts/"
  #  else
  #    log "  No font files found to copy."
  #  fi
  #fi

  ########################################
  #   First pass: place and clean HTML   #
  ########################################

  processed=0
  skipped=0
  unprocessed=0

  mapping_file="$(mktemp_safe)"
  # mapping file: TSV => <original_filename> <TAB> </root/relative/url-without-index>
  # Example: "about.html\t/about"

  html_found=false
  while IFS= read -r -d '' html_file; do
    html_found=true
    filename="$(basename "$html_file")"

    # Extract HTTrack URL
    ht_url="$(extract_httrack_url "$html_file" || true)"
    if [ -z "$ht_url" ]; then
      # No HTTrack URL → cannot infer path: place under /unprocessed/<basename>/index.html
      base_name="${filename%.html}"
      target_dir="$site_dst_dir/${base_name}"
      mkdir -p "$target_dir"
      cp -p "$html_file" "$target_dir/index.html"
      log "  → $filename had no HTTrack URL; copied to unprocessed/${base_name}/index.html"
      unprocessed=$((unprocessed+1))
      continue
    fi

    # Optionally skip PHP-backed URLs
    if [ "$SKIP_PHP_URLS" = true ] && printf '%s' "$ht_url" | grep -qE '\.php(\?|/|$)'; then
      log "  Skipping PHP URL for $filename → $ht_url"
      skipped=$((skipped+1))
      continue
    fi

    # Derive path from URL
    path="$(url_to_path "$ht_url")"
    if [ -z "$path" ]; then
      target_dir="$site_dst_dir"
      target_file="$target_dir/index.html"
      root_url="/"
    else
      target_dir="$site_dst_dir/$path"
      target_file="$target_dir/index.html"
      root_url="/$path"
    fi

    # Avoid duplicates (first one wins)
    if [ -f "$target_file" ]; then
      log "  Skipping $filename (index.html already exists at $root_url/)"
      skipped=$((skipped+1))
      continue
    fi

    mkdir -p "$target_dir"
    cp -p "$html_file" "$target_file"

    # Remove HTTrack comments and Drupal generator
    sed_i '/<!-- Mirrored from .* by HTTrack/d' "$target_file"
    sed_i '/<!-- Added by HTTrack -->/d' "$target_file"
    sed_i '/<!-- \/Added by HTTrack -->/d' "$target_file"
    sed_i '/<meta name="Generator" content="Drupal.*".*\/>/d' "$target_file"

    # Rewrite asset references to root-relative, anchored to href/src
    sed_i "s|\(href\|src\)=\([\"']\)images/\([^\"' ]*\.css\)|\1=\2/css/\3|g" "$target_file"
    sed_i "s|\(href\|src\)=\([\"']\)images/\([^\"' ]*\.js\)|\1=\2/js/\3|g" "$target_file"
    sed_i "s|\(href\|src\)=\([\"']\)images/\([^\"' ]*\.pdf\)|\1=\2/files/\3|g" "$target_file"
    sed_i "s|\(href\|src\)=\([\"']\)images/|\1=\2/images/|g" "$target_file"
    # Basic srcset normalization (turn ' images/' into ' /images/')
    sed_i 's#[[:space:]]images/# /images/#g' "$target_file"
    
    # Record mapping (root-relative clean URL)
    if [ -z "$path" ]; then
      printf '%s\t%s\n' "$filename" "/" >> "$mapping_file"
      log "  ✓ $filename → / (paths updated)"
    else
      printf '%s\t/%s\n' "$filename" "$path" >> "$mapping_file"
      log "  ✓ $filename → /$path (paths updated)"
    fi

    processed=$((processed+1))
  done < <(find "$site_src_dir" -maxdepth 1 -type f -name '*.html' -print0 2>/dev/null)

  if [ "$html_found" = false ]; then
    warn "No HTML files found at $site_src_dir."
  fi

  ########################################
  # Second pass: rewrite internal links   #
  ########################################
  if [ -s "$mapping_file" ]; then
    log ""
    log "Updating internal links to root-relative clean URLs..."
    links_updated=0

    # For each processed target file
    while IFS=$'\t' read -r src_filename src_url; do
      # Map this URL back to its physical index.html
      if [ "$src_url" = "/" ]; then
        target_file="$site_dst_dir/index.html"
      else
        target_file="$site_dst_dir/${src_url#/}/index.html"
      fi
      [ -f "$target_file" ] || continue

      # Replace references to any known page
      while IFS=$'\t' read -r target_name target_url; do
        name_no_ext="${target_name%.html}"

        # filename.html and filename
        sed_i "s|href=\"$target_name\"|href=\"$target_url\"|g" "$target_file" || true
        sed_i "s|href='$target_name'|href='$target_url'|g" "$target_file" || true
        sed_i "s|href=\"$name_no_ext\"|href=\"$target_url\"|g" "$target_file" || true
        sed_i "s|href='$name_no_ext'|href='$target_url'|g" "$target_file" || true

        # ./filename(.html)
        sed_i "s|href=\"\./$target_name\"|href=\"$target_url\"|g" "$target_file" || true
        sed_i "s|href='\./$target_name'|href='$target_url'|g" "$target_file" || true
        sed_i "s|href=\"\./$name_no_ext\"|href=\"$target_url\"|g" "$target_file" || true
        sed_i "s|href='\./$name_no_ext'|href='$target_url'|g" "$target_file" || true

        # Special: index -> "/"
        if [ "$name_no_ext" = "index" ]; then
          sed_i 's|href="index\.html"|href="/"|g' "$target_file" || true
          sed_i "s|href='index\.html'|href='/'|g" "$target_file" || true
          sed_i 's|href="index"|href="/"|g' "$target_file" || true
          sed_i "s|href='index'|href='/'|g" "$target_file" || true
        fi
      done < "$mapping_file"

      # Convert absolute site links to root-relative (strip http(s)://site[/index.php])
      site_domain="$site"
      sed_i "s|https://$site_domain/index\.php||g" "$target_file"  || true
      sed_i "s|http://$site_domain/index\.php||g"  "$target_file"  || true
      sed_i "s|https://$site_domain||g"            "$target_file"  || true
      sed_i "s|http://$site_domain||g"             "$target_file"  || true

      links_updated=$((links_updated+1))
    done < "$mapping_file"

    log "✓ Updated internal links in $links_updated HTML files (root-relative)."
  fi

  # Clean up mapping
  rm -f "$mapping_file"

  ########################################
  #        Generate sitemap.xml          #
  ########################################

  log ""
  log "Generating sitemap.xml..."

  sitemap_file="$site_dst_dir/sitemap.xml"
  hostname="${CUSTOM_HOST:-$site}"

  # Sanitize hostname: strip scheme + trailing slash
  hostname="$(echo "$hostname" | sed -E 's#^[a-zA-Z]+://##; s#/$##')"
  if ! printf '%s' "$hostname" | grep -qE '^[A-Za-z0-9.-]+(:[0-9]+)?$'; then
    warn "Hostname '$hostname' might not be a valid domain. Continuing."
  fi

  lastmod="$(date -u +%Y-%m-%dT%H:%M:%S+00:00)"

  cat > "$sitemap_file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
EOF

  # Root URL
  write_sitemap_url "$sitemap_file" "https://$hostname/" "$lastmod" "daily" "1.0"
  sitemap_entries=1

  # All index.html except unprocessed root — use process substitution (no subshell)
  while IFS= read -r -d '' index_file; do
    rel="${index_file#$site_dst_dir/}"
    [ "$rel" = "index.html" ] && continue
    url_path="${rel%/index.html}"
    [ -z "$url_path" ] && continue
    write_sitemap_url "$sitemap_file" "https://$hostname/$url_path" "$lastmod" "weekly" "0.8"
    sitemap_entries=$((sitemap_entries+1))
  done < <(find "$site_dst_dir" -type f -name "index.html" ! -path "*/unprocessed/*" -print0)

  echo "</urlset>" >> "$sitemap_file"
  log "✓ Generated sitemap.xml with $sitemap_entries URLs"

  ########################################
  #    Fix font URLs inside CSS files    #
  ########################################

  if [ -d "$site_dst_dir/css" ]; then
    log ""
    log "Normalizing font paths in CSS → /fonts/..."
    css_files_updated=0
    while IFS= read -r -d '' cssf; do
      sed_i "s|url('\.\./fonts/|url('/fonts/|g" "$cssf"
      sed_i 's|url("\.\./fonts/|url("/fonts/|g' "$cssf"
      sed_i 's|url(\.\./fonts/|url(/fonts/|g' "$cssf"
      sed_i "s|url('fonts/|url('/fonts/|g" "$cssf"
      sed_i 's|url("fonts/|url("/fonts/|g' "$cssf"
      sed_i 's|url(fonts/|url(/fonts/|g' "$cssf"
      css_files_updated=$((css_files_updated+1))
    done < <(find "$site_dst_dir/css" -type f -name '*.css' -print0 2>/dev/null)
    if [ $css_files_updated -gt 0 ]; then
      log "✓ Updated font paths in $css_files_updated CSS files"
    fi
  fi

  ########################################
  #              SUMMARY                 #
  ########################################

  log ""
  log "Summary for $site:"
  log " - HTML files processed: $processed"
  log " - HTML files skipped (duplicates/PHP URLs): $skipped"
  log " - HTML files unprocessed (no HTTrack URL): $unprocessed"
  [ $css_moved -gt 0 ] && log " - CSS files moved: $css_moved"
  [ $js_moved  -gt 0 ] && log " - JS files moved:  $js_moved"
  [ $pdf_moved -gt 0 ] && log " - PDF files moved: $pdf_moved"
  [ $fonts_moved -gt 0 ] && log " - Font files copied: $fonts_moved"
  log " - Sitemap: $sitemap_file"
  log " - Reorganized site: $site_dst_dir"
  log " - Assets: css/, js/, files/, fonts/, images/ under $site_dst_dir"
done < "$SITES_FILE"

log ""
log "======================================"
log "Reorganization complete!"
log ""
log "All reorganized sites are under: $DST_ROOT/"
log "Asset references (CSS/JS/PDF/Fonts) are root-relative."
log "Internal links updated to clean root-relative URLs."
log "HTTrack comments removed from HTML; sitemap.xml generated per site."
``
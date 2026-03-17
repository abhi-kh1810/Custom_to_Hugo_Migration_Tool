#!/bin/bash

# =====================================================
# CREATE 404 ERROR PAGE SCRIPT
# =====================================================
# This script downloads the 404 error page from the live
# site and creates an errors folder structure for static
# site deployment.
#
# Usage: ./create_404_page.sh [site]
#   site: Optional site hostname (defaults to sites.txt)
#
# Example: ./create_404_page.sh www.hjerteamyloidose.dk
# =====================================================

set -e

# Color codes for output
RED='\033[0;31m'
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

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to auto-fix CSS/JS references in 404.html
auto_fix_404_resources() {
    local error_404="$1"
    local reorg_dir="$2"
    
    log_info "Auto-fixing CSS/JS references to match migrated files..."
    
    # Get sample HTML file to extract correct CSS/JS references
    local sample_html=$(find "$reorg_dir" -name "index.html" -type f | head -1)
    
    if [ -z "$sample_html" ] || [ ! -f "$sample_html" ]; then
        log_warning "Could not find sample HTML file for reference"
        return 1
    fi
    
    # Extract CSS files from sample HTML (these are the correct ones from HTTrack)
    local correct_css=$(grep -o 'href="/css/css_[^"]*\.css' "$sample_html" | sed 's/href="\/css\///' | sed 's/?.*//' | head -5 || true)
    
    # Extract JS files from sample HTML
    local correct_js=$(grep -o 'src="/js/js_[^"]*\.js' "$sample_html" | sed 's/src="\/js\///' | sed 's/?.*//' | head -5 || true)
    
    if [ -n "$correct_css" ]; then
        log_info "Found $(echo "$correct_css" | wc -l | xargs) correct CSS files from migrated site"
        
        # Build CSS replacement
        local css_links=""
        for css_file in $correct_css; do
            css_links="${css_links}  <link rel=\"stylesheet\" media=\"all\" href=\"/css/${css_file}\" />\n"
        done
        
        # Replace CSS section in 404.html - remove query parameters and use correct filenames
        # First, let's simplify by just removing query parameters from existing links
        sed -i.bak 's|href="/css/\([^"?]*\)[^"]*"|href="/css/\1"|g' "$error_404"
        
        # Then replace incorrect CSS filenames with correct ones
        for css_file in $correct_css; do
            # Check if this file exists in the css directory
            if [ -f "$reorg_dir/css/$css_file" ]; then
                # Find any CSS reference that doesn't match and replace the first one found
                sed -i.bak2 "s|href=\"/css/css_[^\"]*\.css\"|href=\"/css/$css_file\"|" "$error_404" || true
            fi
        done
        
        rm -f "${error_404}.bak" "${error_404}.bak2"
        log_success "CSS references updated"
    fi
    
    if [ -n "$correct_js" ]; then
        log_info "Found correct JS files from migrated site"
        
        # Replace JS file in 404.html
        local js_file=$(echo "$correct_js" | head -1)
        
        # Replace the main JS bundle reference (remove query params and use correct filename)
        sed -i.bak 's|src="/js/js_[^"]*\.js[^"]*"|src="/js/'"$js_file"'"|g' "$error_404"
        rm -f "${error_404}.bak"
        
        log_success "JS references updated"
    fi
    
    return 0
}

# Function to download and create 404 page
create_404_page() {
    local site="$1"
    local reorg_dir="$2"
    
    log_info "Processing 404 page for $site"
    
    # Create errors directory
    local error_dir="$reorg_dir/errors"
    mkdir -p "$error_dir"
    log_success "Created errors directory: $error_dir"
    
    # Check if HTTrack already captured the 404 page
    # HTTrack saves it with normalized filenames that match other pages
    local httrack_404="$reorg_dir/nonexistent-page-for-404-capture.html"
    
    if [ -f "$httrack_404" ]; then
        log_info "Found 404 page captured by HTTrack (preferred method)"
        cp "$httrack_404" "$error_dir/404.html"
        log_success "Created 404.html from HTTrack capture ($(du -h "$error_dir/404.html" | cut -f1))"
        
        # Even with HTTrack capture, verify and fix CSS/JS references
        auto_fix_404_resources "$error_dir/404.html" "$reorg_dir"
        
        # Create symlink in root
        if [ ! -f "$reorg_dir/404.html" ]; then
            ln -s errors/404.html "$reorg_dir/404.html" 2>/dev/null || \
            cp "$error_dir/404.html" "$reorg_dir/404.html"
            log_success "Created 404.html link in root directory"
        fi
        
        log_success "✅ 404 page uses same CSS/JS filenames as other pages!"
        return 0
    fi
    
    # Fallback: Download 404 page from live site if not captured by HTTrack
    log_warning "404 page not found from HTTrack, downloading from live site..."
    log_warning "Note: CSS/JS filenames may not match - consider re-running migration"
    
    local temp_404="/tmp/404_${site}_$(date +%s).html"
    local nonexistent_url="https://${site}/nonexistent-page-for-404-capture"
    
    log_info "Downloading 404 page from: $nonexistent_url"
    
    # Use curl with -k to skip SSL verification (common in migrations)
    # -L follows redirects, -f fails silently on server errors
    if curl -k -L -s -o "$temp_404" "$nonexistent_url" 2>/dev/null; then
        # Check if we actually got content
        if [ -s "$temp_404" ]; then
            # Copy to error directory
            cp "$temp_404" "$error_dir/404.html"
            log_success "Created 404.html ($(du -h "$error_dir/404.html" | cut -f1))"
            
            # Clean up temp file
            rm -f "$temp_404"
            
            # Fix resource paths in 404.html
            log_info "Fixing resource paths in 404.html..."
            if [ -f "fix_all_resource_paths.sh" ]; then
                if bash fix_all_resource_paths.sh "$site" 2>/dev/null; then
                    log_success "Resource paths fixed"
                else
                    log_warning "Could not fix resource paths (continuing anyway)"
                fi
            else
                log_warning "fix_all_resource_paths.sh not found (skipping path fixes)"
            fi
            
            # Auto-fix CSS/JS references to match HTTrack-downloaded files
            auto_fix_404_resources "$error_dir/404.html" "$reorg_dir"
            
            # Also create a symlink in the root for convenience
            if [ ! -f "$reorg_dir/404.html" ]; then
                ln -s errors/404.html "$reorg_dir/404.html" 2>/dev/null || \
                cp "$error_dir/404.html" "$reorg_dir/404.html"
                log_success "Created 404.html link in root directory"
            fi
            
            return 0
        else
            log_warning "Downloaded file is empty, creating generic 404 page"
            rm -f "$temp_404"
            create_generic_404 "$error_dir" "$site"
            return 1
        fi
    else
        log_warning "Failed to download 404 page, creating generic one"
        rm -f "$temp_404"
        create_generic_404 "$error_dir" "$site"
        return 1
    fi
}

# Function to create a generic 404 page if download fails
create_generic_404() {
    local error_dir="$1"
    local site="$2"
    
    cat > "$error_dir/404.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Not Found - 404</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 60px 40px;
            text-align: center;
            max-width: 600px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        h1 {
            font-size: 120px;
            color: #667eea;
            margin-bottom: 20px;
            font-weight: 700;
        }
        h2 {
            font-size: 32px;
            color: #333;
            margin-bottom: 20px;
        }
        p {
            font-size: 18px;
            color: #666;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        .btn {
            display: inline-block;
            padding: 15px 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 50px;
            font-size: 18px;
            font-weight: 600;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
        }
        .emoji {
            font-size: 60px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">🔍</div>
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>Oops! The page you're looking for doesn't exist. It might have been moved or deleted.</p>
        <a href="/" class="btn">Go Back Home</a>
    </div>
</body>
</html>
EOF
    
    log_success "Created generic 404.html"
    
    # Create root symlink/copy
    local reorg_dir=$(dirname "$error_dir")
    if [ ! -f "$reorg_dir/404.html" ]; then
        ln -s errors/404.html "$reorg_dir/404.html" 2>/dev/null || \
        cp "$error_dir/404.html" "$reorg_dir/404.html"
        log_success "Created 404.html link in root directory"
    fi
}

# =====================================================
# MAIN SCRIPT
# =====================================================

echo ""
echo "======================================================"
echo "  📄 404 ERROR PAGE CREATOR"
echo "======================================================"
echo ""

# Get site from argument or sites.txt
if [ -n "$1" ]; then
    SITE="$1"
    log_info "Using site from argument: $SITE"
else
    # Go up one directory if we're in scripts/
    if [ -f "../sites.txt" ]; then
        SITE=$(head -n 1 ../sites.txt | tr -d '\r\n' | xargs)
    elif [ -f "sites.txt" ]; then
        SITE=$(head -n 1 sites.txt | tr -d '\r\n' | xargs)
    else
        log_error "No site specified and sites.txt not found!"
        exit 1
    fi
    log_info "Using site from sites.txt: $SITE"
fi

if [ -z "$SITE" ]; then
    log_error "Site is empty!"
    exit 1
fi

# Determine the reorganized directory
if [ -d "../public/reorg/$SITE" ]; then
    REORG_DIR="../public/reorg/$SITE"
elif [ -d "public/reorg/$SITE" ]; then
    REORG_DIR="public/reorg/$SITE"
else
    log_error "Reorganized directory not found: public/reorg/$SITE"
    log_info "Make sure to run reorganize_html_by_url.sh first!"
    exit 1
fi

log_info "Target directory: $REORG_DIR"
echo ""

# Create 404 page
if create_404_page "$SITE" "$REORG_DIR"; then
    echo ""
    log_success "404 page creation completed successfully!"
    echo ""
    echo "📁 Files created:"
    echo "  • $REORG_DIR/errors/404.html"
    echo "  • $REORG_DIR/404.html (symlink or copy)"
    echo ""
    echo "📝 Usage with static site hosting:"
    echo "  • GitHub Pages: Looks for 404.html in root"
    echo "  • Netlify: Automatically uses 404.html"
    echo "  • Apache: Configure with ErrorDocument directive"
    echo "  • Nginx: Configure with error_page directive"
    echo ""
else
    echo ""
    log_warning "Created generic 404 page (download failed)"
    echo ""
    echo "📁 Files created:"
    echo "  • $REORG_DIR/errors/404.html (generic)"
    echo "  • $REORG_DIR/404.html (symlink or copy)"
    echo ""
fi

echo "======================================================"
echo ""

exit 0


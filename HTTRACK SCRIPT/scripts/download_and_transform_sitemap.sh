#!/bin/bash

################################################################################
# download_and_transform_sitemap.sh
#
# Downloads sitemap.xml from live Drupal sites and optionally transforms 
# hostnames for preview/staging environments.
#
# Usage:
#   ./download_and_transform_sitemap.sh                    # No transformation
#   ./download_and_transform_sitemap.sh NEW_HOSTNAME       # Full hostname replacement
#   ./download_and_transform_sitemap.sh SUBDOMAIN ENV      # Construct hostname
#
# Examples:
#   ./download_and_transform_sitemap.sh
#   ./download_and_transform_sitemap.sh pfeldicionariomielomes-preview.pfizerstatic.io
#   ./download_and_transform_sitemap.sh pfeldicionariomielomes preview
################################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SITES_FILE="../sites.txt"
OUTPUT_BASE_DIR="../public/reorg"
SITEMAP_ENDPOINT="sitemap.xml?context=all"

################################################################################
# Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

################################################################################
# Main Script
################################################################################

echo "=============================================="
echo "  Sitemap Download & Transform Tool"
echo "=============================================="
echo ""

# Check if sites.txt exists
if [ ! -f "$SITES_FILE" ]; then
    log_error "sites.txt not found in current directory"
    exit 1
fi

# Parse parameters to determine hostname transformation
NEW_HOSTNAME=""
TRANSFORM_MODE="none"

if [ $# -eq 0 ]; then
    TRANSFORM_MODE="none"
    log_info "Mode: No hostname transformation"
elif [ $# -eq 1 ]; then
    TRANSFORM_MODE="full"
    NEW_HOSTNAME="$1"
    log_info "Mode: Full hostname replacement"
    log_info "New hostname: $NEW_HOSTNAME"
elif [ $# -eq 2 ]; then
    TRANSFORM_MODE="construct"
    SUBDOMAIN="$1"
    ENV="$2"
    NEW_HOSTNAME="${SUBDOMAIN}-${ENV}.pfizerstatic.io"
    log_info "Mode: Construct hostname from parts"
    log_info "Subdomain: $SUBDOMAIN, Environment: $ENV"
    log_info "New hostname: $NEW_HOSTNAME"
else
    log_error "Invalid number of parameters"
    echo "Usage:"
    echo "  $0                    # No transformation"
    echo "  $0 NEW_HOSTNAME       # Full hostname replacement"
    echo "  $0 SUBDOMAIN ENV      # Construct hostname"
    exit 1
fi

echo ""

# Process each site in sites.txt
processed_count=0
error_count=0

while IFS= read -r site || [ -n "$site" ]; do
    # Skip empty lines and comments
    [[ -z "$site" || "$site" =~ ^[[:space:]]*# ]] && continue
    
    # Remove leading/trailing whitespace
    site=$(echo "$site" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    [[ -z "$site" ]] && continue
    
    echo "----------------------------------------------"
    log_info "Processing site: $site"
    echo ""
    
    # Construct URLs
    SOURCE_URL="https://${site}/${SITEMAP_ENDPOINT}"
    OUTPUT_DIR="${OUTPUT_BASE_DIR}/${site}"
    OUTPUT_FILE="${OUTPUT_DIR}/sitemap.xml"
    TEMP_FILE=$(mktemp)
    
    # Create output directory if it doesn't exist
    if [ ! -d "$OUTPUT_DIR" ]; then
        log_warning "Output directory doesn't exist: $OUTPUT_DIR"
        mkdir -p "$OUTPUT_DIR"
        log_info "Created directory: $OUTPUT_DIR"
    fi
    
    # Download sitemap from live site
    log_info "Fetching: $SOURCE_URL"
    
    if curl -f -s -L \
        -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
        -H "Accept: application/xml, text/xml, */*" \
        -o "$TEMP_FILE" \
        "$SOURCE_URL"; then
        
        log_success "Downloaded sitemap successfully"
        
        # Check if downloaded file is valid XML
        if ! grep -q "<?xml" "$TEMP_FILE"; then
            log_error "Downloaded file is not valid XML"
            rm -f "$TEMP_FILE"
            ((error_count++))
            continue
        fi
        
        # Remove XSL stylesheet reference (not needed for static sites)
        if grep -q "<?xml-stylesheet" "$TEMP_FILE"; then
            log_info "Removing XSL stylesheet reference"
            sed -i.bak '/<?xml-stylesheet/d' "$TEMP_FILE"
            rm -f "${TEMP_FILE}.bak"
        fi
        
        # Transform hostname if needed
        if [ "$TRANSFORM_MODE" != "none" ]; then
            log_info "Transforming hostnames: $site → $NEW_HOSTNAME"
            
            # Replace all occurrences of the original hostname with the new one
            sed "s|${site}|${NEW_HOSTNAME}|g" "$TEMP_FILE" > "${TEMP_FILE}.transformed"
            mv "${TEMP_FILE}.transformed" "$TEMP_FILE"
            
            log_success "Hostname transformation complete"
        fi
        
        # Save to final location
        mv "$TEMP_FILE" "$OUTPUT_FILE"
        
        # Count entries in sitemap
        entry_count=$(grep -c "<loc>" "$OUTPUT_FILE" || echo "0")
        
        log_success "Saved sitemap to: $OUTPUT_FILE"
        log_info "Sitemap contains $entry_count URLs"
        
        ((processed_count++))
        
    else
        log_error "Failed to download sitemap from $SOURCE_URL"
        log_error "Server returned error (404 or network issue)"
        rm -f "$TEMP_FILE"
        ((error_count++))
        exit 1  # Exit on fetch failure as per requirement 5b
    fi
    
    echo ""
    
done < "$SITES_FILE"

echo "=============================================="
echo "  Summary"
echo "=============================================="
log_success "Processed: $processed_count site(s)"
if [ $error_count -gt 0 ]; then
    log_error "Errors: $error_count site(s)"
    exit 1
fi
echo ""
log_success "All sitemaps downloaded and transformed successfully!"
echo ""


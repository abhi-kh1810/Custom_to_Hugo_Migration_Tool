#!/bin/bash

################################################################################
# compare_sitemap_urls.sh
#
# Reads a CSV file with domain names and subscription names, fetches sitemaps
# from both production and preview environments, checks HTTP status codes,
# and outputs comparison results to a CSV file.
#
# Input CSV Format:
#   domain,subscription_name
#   www.akromegali.se,pfelakromegalise
#   www.dejadefumarconayuda.es,pfeldejadefumarconayudaes
#
# Output CSV Format:
#   production_url,production_status,preview_url,preview_status
#   https://www.akromegali.se/front-page,200,https://pfelakromegalise-preview.pfizerstatic.io/front-page,404
#
# Usage:
#   ./compare_sitemap_urls.sh input.csv output.csv
################################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to extract URLs from sitemap XML
extract_urls_from_sitemap() {
    local sitemap_file=$1
    grep -o '<loc>[^<]*</loc>' "$sitemap_file" | sed 's/<loc>//g' | sed 's/<\/loc>//g'
}

# Function to check HTTP status code
check_http_status() {
    local url=$1
    local status_code
    local redirect_url
    
    # First check without following redirects to detect 301/302
    status_code=$(curl -o /dev/null -s -w "%{http_code}" --max-time 10 \
        -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
        "$url" 2>/dev/null || echo "000")
    
    # If it's a redirect, get the final URL
    if [[ "$status_code" == "301" || "$status_code" == "302" || "$status_code" == "307" || "$status_code" == "308" ]]; then
        redirect_url=$(curl -o /dev/null -s -w "%{url_effective}" -L --max-time 10 \
            -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
            "$url" 2>/dev/null)
        echo "${status_code}→${redirect_url}"
    else
        echo "$status_code"
    fi
}

# Function to download sitemap
download_sitemap() {
    local url=$1
    local output_file=$2
    
    if curl -f -s -L --max-time 30 \
        -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
        -H "Accept: application/xml, text/xml, */*" \
        -o "$output_file" \
        "$url" 2>/dev/null; then
        
        # Check if downloaded file is valid XML
        if grep -q "<?xml" "$output_file" 2>/dev/null && grep -q "<loc>" "$output_file" 2>/dev/null; then
            return 0
        else
            return 1
        fi
    else
        return 1
    fi
}

################################################################################
# Main Script
################################################################################

echo "=============================================="
echo "  Sitemap URL Comparison Tool"
echo "=============================================="
echo ""

# Default values
LOCAL_MODE=false
LOCAL_PORT="9999"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -l|--local)
            LOCAL_MODE=true
            shift
            # Check if port number is provided
            if [[ $1 =~ ^[0-9]+$ ]]; then
                LOCAL_PORT="$1"
                shift
            fi
            ;;
        *)
            break
            ;;
    esac
done

# Check remaining arguments
if [ $# -ne 2 ]; then
    log_error "Invalid number of arguments"
    echo "Usage: $0 [-l|--local [PORT]] input.csv output.csv"
    echo ""
    echo "Options:"
    echo "  -l, --local [PORT]  Use local mode (default port: 9999)"
    echo ""
    echo "Input CSV format:"
    echo "  domain,subscription_name"
    echo "  www.akromegali.se,pfelakromegalise"
    echo ""
    echo "Examples:"
    echo "  $0 input.csv output.csv"
    echo "  $0 --local input.csv output.csv"
    echo "  $0 --local 8080 input.csv output.csv"
    echo ""
    exit 1
fi

INPUT_CSV="$1"
OUTPUT_CSV="$2"

# Check if input file exists
if [ ! -f "$INPUT_CSV" ]; then
    log_error "Input file not found: $INPUT_CSV"
    exit 1
fi

# Create temporary directory for sitemaps
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Show mode
if [ "$LOCAL_MODE" = true ]; then
    log_info "Running in LOCAL mode (localhost:$LOCAL_PORT)"
else
    log_info "Running in PRODUCTION mode"
fi
echo ""

# Initialize output CSV with header
echo "production_url,production_status,preview_url,preview_status" > "$OUTPUT_CSV"
log_success "Created output file: $OUTPUT_CSV"
echo ""

# Process each line in the input CSV
line_number=0
processed_domains=0
error_count=0

while IFS=, read -r domain subscription_name || [ -n "$domain" ]; do
    ((line_number++))
    
    # Skip header line
    if [ $line_number -eq 1 ] && [[ "$domain" == "domain" ]]; then
        continue
    fi
    
    # Skip empty lines
    [[ -z "$domain" ]] && continue
    
    # Remove leading/trailing whitespace
    domain=$(echo "$domain" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    subscription_name=$(echo "$subscription_name" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    [[ -z "$domain" || -z "$subscription_name" ]] && continue
    
    echo "=============================================="
    log_info "Processing: $domain → $subscription_name"
    echo "=============================================="
    echo ""
    
    # Construct URLs based on mode
    if [ "$LOCAL_MODE" = true ]; then
        # Local mode: both production and preview point to localhost
        PROD_SITEMAP_URL="https://${domain}/sitemap.xml?context=all"
        PREVIEW_SITEMAP_URL="http://localhost:${LOCAL_PORT}/sitemap.xml"
        log_info "Local mode: Testing against localhost:$LOCAL_PORT"
    else
        # Production mode: normal URLs
        PROD_SITEMAP_URL="https://${domain}/sitemap.xml?context=all"
        PREVIEW_SITEMAP_URL="https://${subscription_name}-preview.pfizerstatic.io/sitemap.xml"
    fi
    
    PROD_SITEMAP_FILE="${TEMP_DIR}/prod_${domain//\//_}.xml"
    PREVIEW_SITEMAP_FILE="${TEMP_DIR}/preview_${subscription_name}.xml"
    
    # Download production sitemap
    log_info "Downloading production sitemap: $PROD_SITEMAP_URL"
    if download_sitemap "$PROD_SITEMAP_URL" "$PROD_SITEMAP_FILE"; then
        prod_url_count=$(grep -c "<loc>" "$PROD_SITEMAP_FILE" || echo "0")
        log_success "Downloaded production sitemap ($prod_url_count URLs)"
    else
        log_error "Failed to download production sitemap"
        ((error_count++))
        echo ""
        continue
    fi
    
    # Download preview sitemap (or use production sitemap in local mode)
    if [ "$LOCAL_MODE" = true ]; then
        # In local mode, we don't need a separate preview sitemap
        # We'll use the production sitemap and test those URLs on localhost
        log_info "Local mode: Using production sitemap for testing"
        cp "$PROD_SITEMAP_FILE" "$PREVIEW_SITEMAP_FILE"
        preview_url_count=$prod_url_count
        log_success "Using production sitemap for local testing ($preview_url_count URLs)"
    else
        # Production/preview mode: download preview sitemap
        log_info "Downloading preview sitemap: $PREVIEW_SITEMAP_URL"
        if download_sitemap "$PREVIEW_SITEMAP_URL" "$PREVIEW_SITEMAP_FILE"; then
            preview_url_count=$(grep -c "<loc>" "$PREVIEW_SITEMAP_FILE" || echo "0")
            log_success "Downloaded preview sitemap ($preview_url_count URLs)"
        else
            log_error "Failed to download preview sitemap"
            ((error_count++))
            echo ""
            continue
        fi
    fi
    
    echo ""
    log_info "Extracting and checking URLs..."
    echo ""
    
    # Extract URLs from production sitemap
    prod_urls_file="${TEMP_DIR}/prod_urls_${domain//\//_}.txt"
    extract_urls_from_sitemap "$PROD_SITEMAP_FILE" > "$prod_urls_file"
    
    # Extract URLs from preview sitemap
    preview_urls_file="${TEMP_DIR}/preview_urls_${subscription_name}.txt"
    extract_urls_from_sitemap "$PREVIEW_SITEMAP_FILE" > "$preview_urls_file"
    
    # Create path mapping files (compatible with bash 3.2)
    prod_paths_file="${TEMP_DIR}/prod_paths_${domain//\//_}.txt"
    preview_paths_file="${TEMP_DIR}/preview_paths_${subscription_name}.txt"
    
    # Extract paths from preview URLs
    while IFS= read -r preview_url; do
        # Extract path from URL (everything after the domain)
        path=$(echo "$preview_url" | sed 's|https://[^/]*/||' | sed 's|/$||')
        echo "${path}|${preview_url}" >> "$preview_paths_file"
    done < "$preview_urls_file"
    
    # Extract paths from production URLs
    while IFS= read -r prod_url; do
        path=$(echo "$prod_url" | sed 's|https://[^/]*/||' | sed 's|/$||')
        echo "${path}|${prod_url}" >> "$prod_paths_file"
    done < "$prod_urls_file"
    
    # Process production URLs and find matching preview URLs
    url_count=0
    checked_count=0
    
    while IFS= read -r prod_url; do
        ((url_count++))
        
        # Extract path from production URL
        path=$(echo "$prod_url" | sed 's|https://[^/]*/||' | sed 's|/$||')
        
        # Show progress every 10 URLs
        if [ $((url_count % 10)) -eq 0 ]; then
            echo -ne "\rProcessing URLs: $url_count/$prod_url_count"
        fi
        
        # Check production URL status
        prod_status=$(check_http_status "$prod_url")
        
        # Construct preview URL based on mode
        if [ "$LOCAL_MODE" = true ]; then
            # In local mode, always construct localhost URL
            if [ -z "$path" ]; then
                preview_url="http://localhost:${LOCAL_PORT}/"
            else
                preview_url="http://localhost:${LOCAL_PORT}/${path}"
            fi
            preview_status=$(check_http_status "$preview_url")
        else
            # Find matching preview URL by searching the paths file
            preview_url=$(grep "^${path}|" "$preview_paths_file" 2>/dev/null | cut -d'|' -f2)
            
            if [ -n "$preview_url" ]; then
                # Check preview URL status
                preview_status=$(check_http_status "$preview_url")
            else
                preview_url="NOT_FOUND"
                preview_status="N/A"
            fi
        fi
        
        # Write to output CSV
        echo "$prod_url,$prod_status,$preview_url,$preview_status" >> "$OUTPUT_CSV"
        
        ((checked_count++))
        
    done < "$prod_urls_file"
    
    # Also check for preview URLs that don't exist in production (skip in local mode)
    if [ "$LOCAL_MODE" = false ]; then
        while IFS= read -r preview_url; do
            path=$(echo "$preview_url" | sed 's|https://[^/]*/||' | sed 's|/$||')
            
            # Check if this path exists in production
            prod_url=$(grep "^${path}|" "$prod_paths_file" 2>/dev/null | cut -d'|' -f2)
            
            if [ -z "$prod_url" ]; then
                # This preview URL doesn't exist in production
                preview_status=$(check_http_status "$preview_url")
                echo "NOT_FOUND,N/A,$preview_url,$preview_status" >> "$OUTPUT_CSV"
                ((checked_count++))
            fi
        done < "$preview_urls_file"
    fi
    
    echo -ne "\r"
    log_success "Processed $checked_count URL comparisons"
    echo ""
    
    ((processed_domains++))
    
done < "$INPUT_CSV"

echo "=============================================="
echo "  Summary"
echo "=============================================="
log_success "Processed: $processed_domains domain(s)"
log_success "Results saved to: $OUTPUT_CSV"

if [ $error_count -gt 0 ]; then
    log_warning "Errors encountered: $error_count"
fi

echo ""
log_success "URL comparison complete!"
echo ""

# Show sample of output
log_info "Sample output (first 10 lines):"
head -n 11 "$OUTPUT_CSV"
echo ""


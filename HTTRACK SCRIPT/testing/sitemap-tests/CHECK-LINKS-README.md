# Link Checker Script

This script checks all links (images and anchors) in your website by:
1. Reading URLs from a sitemap.xml (local file or remote URL)
2. Fetching each HTML page
3. Extracting all `<img>` and `<a>` tags
4. Checking the HTTP status of each URL
5. Reporting any non-200 status codes

## Usage

### Run with local sitemap (default):

```bash
npm run check-links
```

This reads from `./public/sitemap.xml` and checks local HTML files.

### Run with remote sitemap URL:

```bash
node check-links.js https://example.com/sitemap.xml
```

Or with npm:

```bash
npm run check-links -- https://example.com/sitemap.xml
```

This fetches the sitemap and HTML pages from the remote server.

### Run with custom output file:

```bash
node check-links.js https://example.com/sitemap.xml ./my-report.txt
```

### Pre-configured remote check:

```bash
npm run check-links:remote
```

## Command Line Arguments

```
node check-links.js <sitemap-url-or-path> [output-file]
```

- **sitemap-url-or-path** (required): URL or local path to sitemap.xml
  - Remote: `https://example.com/sitemap.xml`
  - Local: `./public/sitemap.xml`
- **output-file** (optional): Path for the report file (default: `./broken-links-report.txt`)

## Examples

```bash
# Check local files
node check-links.js ./public/sitemap.xml

# Check remote website
node check-links.js https://example.com/sitemap.xml

# Check remote with custom output
node check-links.js https://example.com/sitemap.xml ./reports/links-$(date +%Y%m%d).txt

# Use with npm scripts
npm run check-links:remote
```

## What it does

1. **Parses sitemap.xml** - Extracts all page URLs from your sitemap (local or remote)
2. **Fetches HTML content** - Reads local HTML files OR fetches from remote URLs (auto-detected)
3. **Extracts URLs** - Finds all image `src` and anchor `href` attributes
4. **Checks status** - Makes HEAD requests to verify each URL returns 200 OK
5. **Generates report** - Creates `broken-links-report.txt` with detailed findings

## Modes

The script automatically detects whether to use local files or fetch remotely:

- **Local mode**: When sitemap path doesn't start with `http://` or `https://`
  - Reads HTML files from `./public/` directory
  - Faster for local testing
  
- **Remote mode**: When sitemap is a full URL
  - Fetches sitemap and HTML pages via HTTP/HTTPS
  - Follows redirects automatically
  - Useful for checking live websites

## Output

The script creates a file called `broken-links-report.txt` containing:

- Total URLs checked
- Number of broken/error links
- Detailed list of problematic links grouped by page:
  - Link type (img or anchor)
  - HTTP status code
  - Full URL
  - Original URL (if different)
  - Error message (if applicable)
  - Redirect location (if applicable)

## Features

- ✅ Checks both images and anchor links
- ✅ Handles relative and absolute URLs
- ✅ Follows redirects
- ✅ Caches checked URLs to avoid duplicates
- ✅ Concurrent requests (configurable batch size)
- ✅ Timeout handling (10 seconds default)
- ✅ Skips data URLs, mailto, tel, javascript links
- ✅ Detailed error reporting

## Configuration

You can modify these constants in `check-links.js`:

```javascript
const MAX_CONCURRENT_REQUESTS = 5;     // Concurrent requests
const REQUEST_TIMEOUT = 10000;         // Timeout in milliseconds
```

Or pass arguments when running:

```bash
node check-links.js <sitemap-url> [output-file]
```

## Exit Codes

- `0` - All links are working
- `1` - Broken links found or fatal error occurred

## Example Output

```
Link Check Report
Generated: 2025-11-27T10:30:00.000Z
Total URLs checked: 150
Broken/Error links found: 3
================================================================================

Page: https://example.com/article/page1
--------------------------------------------------------------------------------
  Type: img
  Status: 404
  URL: https://example.com/images/missing.png
  
  Type: anchor
  Status: ERROR
  URL: https://broken-site.com/page
  Error: getaddrinfo ENOTFOUND broken-site.com
```

## Notes

- The script automatically detects local vs remote mode based on the sitemap URL
- Local mode reads HTML files from the `public/` directory
- Remote mode fetches pages via HTTP/HTTPS
- External URLs are checked via HTTP HEAD requests
- Images and links are both verified
- The script is safe to run multiple times (uses caching)
- Follows HTTP redirects automatically
- Supports both HTTP and HTTPS protocols

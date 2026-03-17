import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import xml2js from 'xml2js';

// Get sitemap URL from command line arguments
const args = process.argv.slice(2);
const SITEMAP_URL = args[0] || './public/sitemap.xml';
const OUTPUT_FILE = args[1] || './broken-links-report.csv';

// Configuration
const MAX_CONCURRENT_REQUESTS = 5;
const REQUEST_TIMEOUT = 10000; // 10 seconds
const USE_LOCAL_FILES = !SITEMAP_URL.startsWith('http'); // Determine if we should use local files

// Regex patterns to extract URLs from HTML
const IMG_PATTERN = /<img[^>]+src=["']([^"']+)["']/gi;
const ANCHOR_PATTERN = /<a[^>]+href=["']([^"']+)["']/gi;

// Store checked URLs to avoid duplicates
const checkedUrls = new Map();
const brokenLinks = [];

/**
 * Fetch content from a URL (HTTP/HTTPS)
 */
async function fetchFromUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      timeout: REQUEST_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkChecker/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    
    const req = protocol.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Resolve relative redirect URLs
        const redirectUrl = new URL(res.headers.location, url).href;
        return fetchFromUrl(redirectUrl).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Parse sitemap.xml and extract all URLs
 */
async function parseSitemap() {
  try {
    let sitemapContent;
    
    // Check if sitemap is a URL or local file
    if (SITEMAP_URL.startsWith('http://') || SITEMAP_URL.startsWith('https://')) {
      console.log(`Fetching sitemap from: ${SITEMAP_URL}`);
      sitemapContent = await fetchFromUrl(SITEMAP_URL);
    } else {
      console.log(`Reading sitemap from: ${SITEMAP_URL}`);
      sitemapContent = await fs.readFile(SITEMAP_URL, 'utf-8');
    }
    
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(sitemapContent);
    
    const urls = result.urlset.url.map(entry => entry.loc[0]);
    console.log(`Found ${urls.length} URLs in sitemap`);
    return urls;
  } catch (error) {
    console.error('Error parsing sitemap:', error.message);
    throw error;
  }
}

/**
 * Fetch HTML content from a URL
 */
async function fetchHtml(url) {
  try {
    // If using local files, try to read from disk
    if (USE_LOCAL_FILES) {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname === '/' ? '/index.html' : urlObj.pathname;
      const localPath = path.join('./public', pathname);
      
      try {
        return await fs.readFile(localPath, 'utf-8');
      } catch {
        // If index.html doesn't exist, try with /index.html appended
        const indexPath = path.join(localPath, 'index.html');
        try {
          return await fs.readFile(indexPath, 'utf-8');
        } catch {
          console.warn(`Could not read local file: ${localPath} or ${indexPath}`);
          return '';
        }
      }
    } else {
      // Fetch from remote URL
      console.log(`Fetching: ${url}`);
      return await fetchFromUrl(url);
    }
  } catch (error) {
    console.warn(`Failed to fetch ${url}: ${error.message}`);
    return '';
  }
}

/**
 * Extract all image and anchor URLs from HTML content
 */
function extractUrls(html, baseUrl) {
  const urls = [];
  
  // Extract image sources
  let match;
  while ((match = IMG_PATTERN.exec(html)) !== null) {
    urls.push({ type: 'img', url: match[1], context: baseUrl });
  }
  
  // Reset regex lastIndex
  IMG_PATTERN.lastIndex = 0;
  
  // Extract anchor hrefs
  while ((match = ANCHOR_PATTERN.exec(html)) !== null) {
    urls.push({ type: 'anchor', url: match[1], context: baseUrl });
  }
  
  // Reset regex lastIndex
  ANCHOR_PATTERN.lastIndex = 0;
  
  return urls;
}

/**
 * Resolve relative URLs to absolute URLs
 */
function resolveUrl(url, baseUrl) {
  // Skip data URLs, mailto, tel, javascript, etc.
  if (url.startsWith('data:') || 
      url.startsWith('mailto:') || 
      url.startsWith('tel:') || 
      url.startsWith('javascript:') ||
      url.startsWith('#')) {
    return null;
  }
  
  try {
    // If it's already absolute, return it
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // Resolve relative URL
    const base = new URL(baseUrl);
    return new URL(url, base).href;
  } catch (error) {
    console.warn(`Failed to resolve URL: ${url} from ${baseUrl}`);
    return null;
  }
}

/**
 * Check HTTP status of a URL
 */
async function checkUrlStatus(url) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        method: 'HEAD',
        timeout: REQUEST_TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LinkChecker/1.0)'
        }
      };
      
      const req = protocol.request(url, options, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve({ status: res.statusCode, redirectTo: res.headers.location });
        } else {
          resolve({ status: res.statusCode });
        }
      });
      
      req.on('error', (error) => {
        resolve({ status: 'ERROR', error: error.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 'TIMEOUT', error: 'Request timeout' });
      });
      
      req.end();
    } catch (error) {
      resolve({ status: 'ERROR', error: error.message });
    }
  });
}

/**
 * Check a single URL and cache the result
 */
async function checkUrl(urlInfo) {
  const { type, url, context } = urlInfo;
  const resolvedUrl = resolveUrl(url, context);
  
  if (!resolvedUrl) {
    return null;
  }
  
  // Check if we've already tested this URL
  if (checkedUrls.has(resolvedUrl)) {
    return checkedUrls.get(resolvedUrl);
  }
  
  console.log(`Checking ${type}: ${resolvedUrl}`);
  const result = await checkUrlStatus(resolvedUrl);
  
  checkedUrls.set(resolvedUrl, result);
  
  // Log non-200 responses
  if (result.status !== 200 && result.status !== 304) {
    const errorInfo = {
      type,
      url: resolvedUrl,
      originalUrl: url,
      foundIn: context,
      status: result.status,
      error: result.error,
      redirectTo: result.redirectTo
    };
    brokenLinks.push(errorInfo);
    console.error(`❌ [${result.status}] ${type} in ${context}: ${resolvedUrl}`);
  } else {
    console.log(`✅ [${result.status}] ${resolvedUrl}`);
  }
  
  return result;
}

/**
 * Process URLs in batches to avoid overwhelming the system
 */
async function processBatch(urls, batchSize) {
  const results = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(checkUrl));
    results.push(...batchResults);
    
    // Small delay between batches
    if (i + batchSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  return results;
}

/**
 * Escape CSV field to handle commas, quotes, and newlines
 */
function escapeCSV(field) {
  if (field === null || field === undefined) {
    return '';
  }
  const str = String(field);
  // If field contains comma, quote, or newline, wrap it in quotes and escape existing quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Write report to file in CSV format
 */
async function writeReport() {
  // CSV Header
  const headers = [
    'Found In Page',
    'Link Type',
    'Status',
    'URL',
    'Original URL',
    'Error Message',
    'Redirect To'
  ];
  
  let csvContent = headers.join(',') + '\n';
  
  if (brokenLinks.length === 0) {
    // Add a summary row if no broken links
    csvContent += `"No broken links found","Generated: ${new Date().toISOString()}","Total URLs checked: ${checkedUrls.size}","","","",""\n`;
  } else {
    // Add each broken link as a row
    brokenLinks.forEach(link => {
      const row = [
        escapeCSV(link.foundIn),
        escapeCSV(link.type),
        escapeCSV(link.status),
        escapeCSV(link.url),
        escapeCSV(link.originalUrl !== link.url ? link.originalUrl : ''),
        escapeCSV(link.error || ''),
        escapeCSV(link.redirectTo || '')
      ];
      csvContent += row.join(',') + '\n';
    });
  }
  
  await fs.writeFile(OUTPUT_FILE, csvContent, 'utf-8');
  console.log(`\nReport written to: ${OUTPUT_FILE}`);
  console.log(`Format: CSV`);
  console.log(`Columns: Found In Page, Link Type, Status, URL, Original URL, Error Message, Redirect To`);
}

/**
 * Main function
 */
async function main() {
  console.log('Starting link checker...\n');
  
  // Show usage if no sitemap provided
  if (args.length === 0 && !USE_LOCAL_FILES) {
    console.log('Usage: node check-links.js <sitemap-url-or-path> [output-file]');
    console.log('\nExamples:');
    console.log('  node check-links.js https://example.com/sitemap.xml');
    console.log('  node check-links.js ./public/sitemap.xml ./report.txt');
    console.log('  npm run check-links -- https://example.com/sitemap.xml\n');
  }
  
  console.log(`Sitemap: ${SITEMAP_URL}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Mode: ${USE_LOCAL_FILES ? 'Local files' : 'Remote fetch'}\n`);
  
  try {
    // Parse sitemap
    const sitemapUrls = await parseSitemap();
    
    // Process each page
    for (const pageUrl of sitemapUrls) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Processing: ${pageUrl}`);
      console.log(`${'='.repeat(80)}`);
      
      const html = await fetchHtml(pageUrl);
      if (!html) {
        console.warn(`Skipping ${pageUrl} - no content found`);
        continue;
      }
      
      // Extract URLs from HTML
      const extractedUrls = extractUrls(html, pageUrl);
      console.log(`Found ${extractedUrls.length} URLs (images + anchors)`);
      
      // Check URLs in batches
      await processBatch(extractedUrls, MAX_CONCURRENT_REQUESTS);
    }
    
    // Write report
    await writeReport();
    
    console.log('\n✅ Link check complete!');
    console.log(`Total URLs checked: ${checkedUrls.size}`);
    console.log(`Broken/Error links: ${brokenLinks.length}`);
    
    // Exit with error code if broken links found
    process.exit(brokenLinks.length > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();

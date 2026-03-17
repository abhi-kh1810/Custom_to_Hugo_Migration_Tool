const fs = require('fs');
const path = require('path');

// Get the base URL from environment variable or use default
const PUBLIC_DIR = path.join(__dirname, 'public');
const publicData = require(path.join(__dirname, 'public_data.json'));
console.log('Loaded public_data:', publicData.site_url);
const BASE_URL = publicData.site_url;
const INCLUDE_PATHS = publicData.additional_path || [];
const EXCLUDE_PATHS = publicData.exclude_path || [];

// Helper function to check if a path should be excluded
function shouldExcludePath(relativePath) {
  // Normalize the path for comparison
  const normalizedPath = relativePath.replace(/\\/g, '/');
  
  // Check if path matches any exclude pattern
  return EXCLUDE_PATHS.some(excludePattern => {
    return normalizedPath.includes(excludePattern) || normalizedPath.startsWith(excludePattern + '/');
  });
}

// Helper function to recursively find all HTML files
function findHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Get relative path from public directory
      const relativePath = path.relative(PUBLIC_DIR, filePath);
      
      // Skip if path is in exclude list
      if (shouldExcludePath(relativePath)) {
        return;
      }
      
      // Skip certain directories
      if (!['css', 'js', 'images', 'files', 'cdn-cgi', 'errors', 'unprocessed'].includes(file)) {
        findHtmlFiles(filePath, fileList);
      }
    } else if (file === 'index.html') {
      // Get relative path from public directory
      const relativePath = path.relative(PUBLIC_DIR, filePath);
      
      // Skip if path is in exclude list
      if (!shouldExcludePath(path.dirname(relativePath))) {
        fileList.push(filePath);
      }
    }
  });
  
  return fileList;
}

// Convert file path to URL path
function getUrlPath(filePath) {
  let relativePath = path.relative(PUBLIC_DIR, filePath);
  // Remove index.html from the path
  relativePath = relativePath.replace(/index\.html$/, '');
  // Convert to URL format
  relativePath = relativePath.replace(/\\/g, '/');
  // Remove trailing slash for root
  if (relativePath === '') {
    return '/';
  }
  // Remove trailing slash for others
  return '/' + relativePath.replace(/\/$/, '');
}

// Get file modification time
function getLastMod(filePath) {
  const stat = fs.statSync(filePath);
  return stat.mtime.toISOString();
}

// Determine priority based on URL depth
function getPriority(urlPath) {
  if (urlPath === '/') {
    return '1.0';
  }
  const depth = urlPath.split('/').filter(p => p).length;
  if (depth === 1) {
    return '0.8';
  }
  return '0.5';
}

// Generate sitemap
function generateSitemap() {
  const htmlFiles = findHtmlFiles(PUBLIC_DIR);
  
  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemap += '<!--Generated dynamically by generate-sitemap.js-->\n';
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';
  
  // Add URLs from existing HTML files
  htmlFiles.forEach(filePath => {
    const urlPath = getUrlPath(filePath);
    const lastMod = getLastMod(filePath);
    const priority = getPriority(urlPath);
    
    sitemap += ' <url>\n';
    sitemap += `  <loc>${BASE_URL}${urlPath}</loc>\n`;
    sitemap += `  <lastmod>${lastMod}</lastmod>\n`;
    if (urlPath === '/') {
      sitemap += '  <changefreq>daily</changefreq>\n';
    }
    sitemap += `  <priority>${priority}</priority>\n`;
    sitemap += ' </url>\n';
  });
  
  // Add additional paths from additional_path (non-existing paths)
  INCLUDE_PATHS.forEach(includePath => {
    // Check if the path is not in exclude list
    if (!shouldExcludePath(includePath)) {
      // Normalize the path to URL format
      const urlPath = '/' + includePath.replace(/\\/g, '/').replace(/\/$/, '');
      const currentDate = new Date().toISOString();
      
      sitemap += ' <url>\n';
      sitemap += `  <loc>${BASE_URL}${urlPath}</loc>\n`;
      sitemap += `  <lastmod>${currentDate}</lastmod>\n`;
      sitemap += '  <priority>0.5</priority>\n';
      sitemap += ' </url>\n';
    }
  });
  
  sitemap += '</urlset>\n';
  
  // Write sitemap to file
  const sitemapPath = path.join(PUBLIC_DIR, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, sitemap, 'utf8');
  console.log(`✓ Sitemap generated successfully at ${sitemapPath}`);
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Total URLs: ${htmlFiles.length + INCLUDE_PATHS.length}`);
  console.log(`  HTML files found: ${htmlFiles.length}`);
  console.log(`  Included paths: ${INCLUDE_PATHS.length}`);
  console.log(`  Excluded patterns: ${EXCLUDE_PATHS.join(', ')}`);
}

// Run the generator
try {
  generateSitemap();
} catch (error) {
  console.error('Error generating sitemap:', error);
  process.exit(1);
}
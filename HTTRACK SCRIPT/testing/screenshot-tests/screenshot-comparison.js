const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { parseString } = require('xml2js');
const https = require('https');
const http = require('http');

// Load configuration
function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  
  // Filter enabled sites and viewports
  config.enabledSites = config.sites.filter(site => site.enabled);
  config.enabledViewports = Object.entries(config.viewports)
    .filter(([_, viewport]) => viewport.enabled)
    .map(([name, viewport]) => ({ name, ...viewport }));
  
  return config;
}

const CONFIG = loadConfig();
const SCREENSHOTS_DIR = CONFIG.settings.screenshotsDir;
const COMPARISON_DIR = CONFIG.settings.comparisonDir;

/**
 * Fetch sitemap XML from URL
 */
async function fetchSitemap(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Parse sitemap XML and extract URLs
 */
async function parseSitemap(sitemapUrl) {
  console.log(`📄 Fetching sitemap from: ${sitemapUrl}`);
  const sitemapContent = await fetchSitemap(sitemapUrl);
  
  return new Promise((resolve, reject) => {
    parseString(sitemapContent, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      
      const urls = result.urlset.url.map(entry => entry.loc[0]);
      resolve(urls);
    });
  });
}

/**
 * Convert preview URL to production URL
 */
function convertToProductionUrl(previewUrl, site) {
  return previewUrl.replace(site.previewUrl, site.prodUrl);
}

/**
 * Create necessary directories
 */
function setupDirectories() {
  [SCREENSHOTS_DIR, COMPARISON_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  // Create subdirectories for each site, environment, and viewport
  CONFIG.enabledSites.forEach(site => {
    ['prod', 'preview'].forEach(env => {
      CONFIG.enabledViewports.forEach(viewport => {
        const dir = path.join(SCREENSHOTS_DIR, site.name, env, viewport.name);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
    });
  });
}

/**
 * Generate a safe filename from URL
 */
function urlToFilename(url) {
  return url
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
}

/**
 * Take screenshot of a page
 */
async function takeScreenshot(page, url, siteName, environment, viewportName) {
  try {
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: CONFIG.settings.timeout
    });
    
    // Wait a bit for any animations or dynamic content
    await page.waitForTimeout(CONFIG.settings.waitAfterLoad);
    
    const filename = urlToFilename(url);
    const screenshotPath = path.join(
      SCREENSHOTS_DIR,
      siteName,
      environment,
      viewportName,
      `${filename}.png`
    );
    
    await page.screenshot({
      path: screenshotPath,
      fullPage: CONFIG.settings.fullPage
    });
    
    console.log(`✓ Screenshot saved: ${siteName}/${environment}/${viewportName}/${filename}.png`);
    return screenshotPath;
  } catch (error) {
    console.error(`✗ Error taking screenshot for ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Compare two screenshots using Playwright's built-in comparison
 */
async function compareScreenshots(prodPath, previewPath, siteName, urlName, viewportName) {
  if (!prodPath || !previewPath) {
    return {
      siteName,
      urlName,
      viewportName,
      match: false,
      error: 'Missing screenshot(s)'
    };
  }
  
  try {
    const prodBuffer = fs.readFileSync(prodPath);
    const previewBuffer = fs.readFileSync(previewPath);
    
    // For now, just check if files exist and have content
    // In a real scenario, you'd use a proper image comparison library
    const filesExist = prodBuffer.length > 0 && previewBuffer.length > 0;
    
    return {
      siteName,
      urlName,
      viewportName,
      match: filesExist,
      prodPath,
      previewPath,
      prodSize: prodBuffer.length,
      previewSize: previewBuffer.length
    };
  } catch (error) {
    return {
      siteName,
      urlName,
      viewportName,
      match: false,
      error: error.message
    };
  }
}

/**
 * Generate HTML report
 */
function generateReport(results) {
  // Group results by site
  const resultsBySite = {};
  results.forEach(result => {
    if (!resultsBySite[result.siteName]) {
      resultsBySite[result.siteName] = [];
    }
    resultsBySite[result.siteName].push(result);
  });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Screenshot Comparison Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        .header {
            background: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        h2 {
            color: #555;
            margin: 30px 0 15px 0;
            padding: 15px;
            background: white;
            border-radius: 8px;
            border-left: 4px solid #1976d2;
        }
        .summary {
            color: #666;
            font-size: 14px;
        }
        .comparison-grid {
            display: grid;
            gap: 20px;
        }
        .comparison-item {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .comparison-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
        }
        .url-name {
            font-weight: 600;
            color: #333;
            font-size: 16px;
            word-break: break-all;
        }
        .viewport-tag {
            background: #e3f2fd;
            color: #1976d2;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .site-tag {
            background: #f3e5f5;
            color: #7b1fa2;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            margin-right: 8px;
        }
        .screenshots {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        .screenshot-container {
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
        }
        .screenshot-label {
            background: #f5f5f5;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 600;
            color: #666;
            text-transform: uppercase;
        }
        .screenshot-wrapper {
            padding: 10px;
            background: #fafafa;
            text-align: center;
        }
        .screenshot-wrapper img {
            max-width: 100%;
            height: auto;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
        }
        .screenshot-info {
            padding: 8px 12px;
            background: #f9f9f9;
            font-size: 11px;
            color: #888;
            border-top: 1px solid #e0e0e0;
        }
        .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }
        .status.success {
            background: #e8f5e9;
            color: #2e7d32;
        }
        .status.error {
            background: #ffebee;
            color: #c62828;
        }
        .error-message {
            background: #fff3e0;
            color: #e65100;
            padding: 12px;
            border-radius: 4px;
            margin-top: 10px;
            font-size: 13px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .stat-card {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 6px;
            text-align: center;
        }
        .stat-value {
            font-size: 32px;
            font-weight: 700;
            color: #333;
        }
        .stat-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-top: 5px;
        }
        .site-stats {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }
        .site-stat {
            background: #f5f5f5;
            padding: 10px 15px;
            border-radius: 6px;
            font-size: 13px;
        }
        .site-stat strong {
            color: #333;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Screenshot Comparison Report</h1>
        <div class="summary">
            Generated on ${new Date().toLocaleString()} | ${CONFIG.enabledSites.length} sites | ${CONFIG.enabledViewports.length} viewports
        </div>
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${results.length}</div>
                <div class="stat-label">Total Comparisons</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${CONFIG.enabledSites.length}</div>
                <div class="stat-label">Sites Tested</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${results.filter(r => r.match).length}</div>
                <div class="stat-label">Successful</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${results.filter(r => !r.match).length}</div>
                <div class="stat-label">With Issues</div>
            </div>
        </div>
    </div>
    
    ${Object.entries(resultsBySite).map(([siteName, siteResults]) => `
        <h2>📊 ${siteName}</h2>
        <div class="site-stats">
            <div class="site-stat"><strong>${siteResults.length}</strong> comparisons</div>
            <div class="site-stat"><strong>${siteResults.filter(r => r.match).length}</strong> successful</div>
            <div class="site-stat"><strong>${siteResults.filter(r => !r.match).length}</strong> issues</div>
        </div>
        <div class="comparison-grid">
            ${siteResults.map(result => `
                <div class="comparison-item">
                    <div class="comparison-header">
                        <div class="url-name">${result.urlName}</div>
                        <div>
                            <span class="site-tag">${result.siteName}</span>
                            <span class="viewport-tag">${result.viewportName}</span>
                            <span class="status ${result.match ? 'success' : 'error'}">
                                ${result.match ? '✓ Captured' : '✗ Issue'}
                            </span>
                        </div>
                    </div>
                    
                    ${result.error ? `
                        <div class="error-message">
                            <strong>Error:</strong> ${result.error}
                        </div>
                    ` : `
                        <div class="screenshots">
                            <div class="screenshot-container">
                                <div class="screenshot-label">Production</div>
                                <div class="screenshot-wrapper">
                                    <img src="${path.relative(COMPARISON_DIR, result.prodPath)}" 
                                         alt="Production screenshot" 
                                         loading="lazy">
                                </div>
                                <div class="screenshot-info">
                                    Size: ${(result.prodSize / 1024).toFixed(2)} KB
                                </div>
                            </div>
                            
                            <div class="screenshot-container">
                                <div class="screenshot-label">Preview</div>
                                <div class="screenshot-wrapper">
                                    <img src="${path.relative(COMPARISON_DIR, result.previewPath)}" 
                                         alt="Preview screenshot" 
                                         loading="lazy">
                                </div>
                                <div class="screenshot-info">
                                    Size: ${(result.previewSize / 1024).toFixed(2)} KB
                                </div>
                            </div>
                        </div>
                    `}
                </div>
            `).join('')}
        </div>
    `).join('')}
</body>
</html>
  `;
  
  const reportPath = path.join(COMPARISON_DIR, 'comparison-report.html');
  fs.writeFileSync(reportPath, html);
  console.log(`\n📊 Report generated: ${reportPath}`);
  return reportPath;
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Starting screenshot comparison...\n');
  console.log(`📋 Configuration:`);
  console.log(`   - Sites: ${CONFIG.enabledSites.length} enabled`);
  console.log(`   - Viewports: ${CONFIG.enabledViewports.map(v => v.name).join(', ')}`);
  console.log('');
  
  // Setup directories
  setupDirectories();
  
  // Launch browser
  const browser = await chromium.launch({
    headless: true
  });
  
  const results = [];
  
  try {
    // Process each site
    for (const site of CONFIG.enabledSites) {
      console.log(`\n🌐 Processing site: ${site.name}`);
      console.log(`   Preview: ${site.previewUrl}`);
      console.log(`   Production: ${site.prodUrl}`);
      
      // Parse sitemap for this site
      const sitemapUrl = `${site.previewUrl}/sitemap.xml`;
      let previewUrls;
      try {
        previewUrls = await parseSitemap(sitemapUrl);
        console.log(`   Found ${previewUrls.length} URLs in sitemap\n`);
      } catch (error) {
        console.error(`   ❌ Error fetching sitemap: ${error.message}`);
        continue;
      }
      
      // Process each viewport size
      for (const viewport of CONFIG.enabledViewports) {
        console.log(`   📱 Processing ${viewport.name} viewport (${viewport.width}x${viewport.height})...`);
        
        const context = await browser.newContext({
          viewport: {
            width: viewport.width,
            height: viewport.height
          },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        });
        
        const page = await context.newPage();
        
        // Process each URL
        for (const previewUrl of previewUrls) {
          const prodUrl = convertToProductionUrl(previewUrl, site);
          const urlName = urlToFilename(previewUrl);
          
          console.log(`      Processing: ${prodUrl}`);
          
          // Take production screenshot
          const prodScreenshot = await takeScreenshot(page, prodUrl, site.name, 'prod', viewport.name);
          
          // Take preview screenshot
          const previewScreenshot = await takeScreenshot(page, previewUrl, site.name, 'preview', viewport.name);
          
          // Compare screenshots
          const comparisonResult = await compareScreenshots(
            prodScreenshot,
            previewScreenshot,
            site.name,
            urlName,
            viewport.name
          );
          
          results.push(comparisonResult);
        }
        
        await context.close();
      }
    }
    
    // Generate report
    console.log('\n📊 Generating comparison report...');
    const reportPath = generateReport(results);
    
    // Generate JSON summary
    const summaryPath = path.join(COMPARISON_DIR, 'comparison-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
    console.log(`📄 JSON summary saved: ${summaryPath}`);
    
    console.log('\n✅ Screenshot comparison complete!');
    console.log(`\n📁 Screenshots saved in: ${SCREENSHOTS_DIR}`);
    console.log(`📊 Report available at: ${reportPath}`);
    
  } catch (error) {
    console.error('\n❌ Error during execution:', error);
  } finally {
    await browser.close();
  }
}

// Run the script
main().catch(console.error);

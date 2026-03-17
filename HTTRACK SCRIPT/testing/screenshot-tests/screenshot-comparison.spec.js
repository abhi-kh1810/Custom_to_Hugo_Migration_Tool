const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { parseString } = require('xml2js');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
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
 * Parse sitemap and extract URLs
 */
async function parseSitemap(sitemapUrl) {
  console.log(`Fetching sitemap from: ${sitemapUrl}`);
  const sitemapContent = await fetchSitemap(sitemapUrl);
  
  return new Promise((resolve, reject) => {
    parseString(sitemapContent, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      
      const urls = result.urlset.url.map(entry => ({
        preview: entry.loc[0],
        prod: entry.loc[0]
      }));
      resolve(urls);
    });
  });
}

/**
 * Compare two PNG images pixel by pixel
 */
function compareImages(img1Path, img2Path, diffPath) {
  const img1 = PNG.sync.read(fs.readFileSync(img1Path));
  const img2 = PNG.sync.read(fs.readFileSync(img2Path));
  
  const { width, height } = img1;
  const diff = new PNG({ width, height });
  
  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );
  
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  
  const totalPixels = width * height;
  const diffPercentage = (numDiffPixels / totalPixels) * 100;
  
  return {
    numDiffPixels,
    totalPixels,
    diffPercentage: diffPercentage.toFixed(2)
  };
}

// Parse sitemap once before tests for all sites
let siteUrlMap = {};

test.beforeAll(async () => {
  console.log(`Loading ${CONFIG.enabledSites.length} enabled sites...`);
  
  for (const site of CONFIG.enabledSites) {
    const sitemapUrl = `${site.previewUrl}/sitemap.xml`;
    try {
      const urls = await parseSitemap(sitemapUrl);
      // Convert preview URLs to prod URLs
      siteUrlMap[site.name] = urls.map(urlPair => ({
        preview: urlPair.preview,
        prod: urlPair.preview.replace(site.previewUrl, site.prodUrl)
      }));
      console.log(`Found ${siteUrlMap[site.name].length} URLs for ${site.name}`);
    } catch (error) {
      console.error(`Error fetching sitemap for ${site.name}:`, error.message);
      siteUrlMap[site.name] = [];
    }
  }
});

// Generate tests for each site, viewport, and URL combination
CONFIG.enabledSites.forEach(site => {
  CONFIG.enabledViewports.forEach(viewport => {
    test.describe(`${site.name} - ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height }
      });
      
      test.beforeEach(async ({ page }) => {
        // Set additional page settings
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'da-DK,da;q=0.9,en;q=0.8'
        });
      });
      
      test(`Compare ${site.name} URLs`, async ({ page }) => {
        const urls = siteUrlMap[site.name] || [];
        
        if (urls.length === 0) {
          test.skip();
          return;
        }
        
        for (const urlPair of urls) {
          const urlName = urlPair.prod
            .replace(/https?:\/\//, '')
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase();
          
          const screenshotDir = path.join('screenshots', site.name, viewport.name);
          fs.mkdirSync(screenshotDir, { recursive: true });
          
          const prodScreenshotPath = path.join(screenshotDir, `${urlName}_prod.png`);
          const previewScreenshotPath = path.join(screenshotDir, `${urlName}_preview.png`);
          const diffScreenshotPath = path.join(screenshotDir, `${urlName}_diff.png`);
          
          // Take production screenshot
          await page.goto(urlPair.prod, { 
            waitUntil: 'networkidle',
            timeout: CONFIG.settings.timeout
          });
          await page.waitForTimeout(CONFIG.settings.waitAfterLoad);
          await page.screenshot({ 
            path: prodScreenshotPath, 
            fullPage: CONFIG.settings.fullPage
          });
          
          // Take preview screenshot
          await page.goto(urlPair.preview, { 
            waitUntil: 'networkidle',
            timeout: CONFIG.settings.timeout
          });
          await page.waitForTimeout(CONFIG.settings.waitAfterLoad);
          await page.screenshot({ 
            path: previewScreenshotPath, 
            fullPage: CONFIG.settings.fullPage
          });
          
          // Compare screenshots
          try {
            const comparison = compareImages(
              prodScreenshotPath,
              previewScreenshotPath,
              diffScreenshotPath
            );
            
            console.log(`\n${urlPair.prod}`);
            console.log(`  Site: ${site.name}`);
            console.log(`  Viewport: ${viewport.name}`);
            console.log(`  Diff pixels: ${comparison.numDiffPixels} (${comparison.diffPercentage}%)`);
            
            // Attach screenshots to the report
            test.info().attachments.push({
              name: 'Production',
              path: prodScreenshotPath,
              contentType: 'image/png'
            });
            
            test.info().attachments.push({
              name: 'Preview',
              path: previewScreenshotPath,
              contentType: 'image/png'
            });
            
            if (comparison.numDiffPixels > 0) {
              test.info().attachments.push({
                name: 'Diff',
                path: diffScreenshotPath,
                contentType: 'image/png'
              });
            }
            
            // You can set a threshold here (e.g., fail if more than 5% different)
            // expect(parseFloat(comparison.diffPercentage)).toBeLessThan(5);
            
          } catch (error) {
            console.error(`Error comparing screenshots: ${error.message}`);
            throw error;
          }
        }
      });
    });
  });
});

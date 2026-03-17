// Entry point for checking Adobe Analytics firing on URLs from sitemap.xml or a list
// Usage: node check-analytics.js <sitemap.xml or urls.txt>

import { chromium } from 'playwright';
import fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

async function getUrlsFromSitemap(sitemapUrl) {
  const res = await fetch(sitemapUrl);
  if (!res.ok) throw new Error(`Failed to fetch sitemap: ${sitemapUrl}`);
  const xml = await res.text();
  const result = await parseStringPromise(xml);
  return result.urlset.url.map(u => u.loc[0]);
}

async function getUrlsFromFile(filePath) {
  let content;
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    // Fetch remote URL list
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`Failed to fetch URL list: ${filePath}`);
    content = await res.text();
  } else {
    // Read local file
    content = fs.readFileSync(filePath, 'utf-8');
  }
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

async function checkAdobeAnalytics(page, debug = false) {
  const analytics = {
    launchLoaded: false,
    pageViewFired: false,
    launchUrl: null,
    pageViewUrl: null,
  };

  // Listen for requests to Adobe Analytics endpoints
  page.on('request', req => {
    const url = req.url();
    
    // Debug: log all analytics-related requests
    if (debug && (url.includes('adobe') || url.includes('omtrdc') || url.includes('demdex') || url.includes('2o7'))) {
      console.log(`🔍 DEBUG request: ${url.substring(0, 120)}...`);
    }
    
    // Adobe Launch library load (e.g., assets.adobedtm.com or launch-*.adobedtm.com)
    if (url.includes('adobedtm.com') && (url.includes('.js') || url.includes('launch'))) {
      analytics.launchLoaded = true;
      analytics.launchUrl = url;
      console.log(`📚 Adobe Launch loaded: ${url.substring(0, 100)}...`);
    }
    
    // Adobe Analytics page view (b/ss/ beacon)
    if (url.includes('b/ss/')) {
      analytics.pageViewFired = true;
      analytics.pageViewUrl = url;
      console.log(`📊 Adobe Analytics Page View fired: ${url.substring(0, 100)}...`);
    }
    
    // Other Adobe endpoints
    if (url.includes('omtrdc.net') || url.includes('adobedc.net')) {
      analytics.pageViewFired = true;
      console.log(`📊 Adobe Analytics request: ${url.substring(0, 100)}...`);
    }
  });

  return () => ({
    passed: analytics.launchLoaded && analytics.pageViewFired,
    launchLoaded: analytics.launchLoaded,
    pageViewFired: analytics.pageViewFired,
  });
}

async function acceptCookies(page) {
  // Wait a moment for cookie banner to appear
  await page.waitForTimeout(2000);
  
  // Try to click common cookie accept buttons
  const selectors = [
    'button#onetrust-accept-btn-handler',
    'button:has-text("Accept All")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    'button:has-text("Allow all")',
    'button.cookie-accept',
    'button:has-text("OK")',
    'button:has-text("Got it")',
    'button:has-text("Agree")',
  ];
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 2000 })) {
        console.log(`✅ Cookie accepted using: ${selector}`);
        await locator.click();
        // Wait 2-3 seconds after accepting cookies to allow page view events to fire
        await page.waitForTimeout(3000);
        return true;
      }
    } catch {}
  }
  console.log('⚠️  No cookie banner found or could not accept cookies');
  return false;
}

// Helper to ensure URL has https:// prefix
function ensureHttps(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

// Extract domain from URL
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Group URLs by domain
function groupUrlsByDomain(urls) {
  const groups = new Map();
  for (const url of urls) {
    const domain = getDomain(url);
    if (!groups.has(domain)) {
      groups.set(domain, []);
    }
    groups.get(domain).push(url);
  }
  return groups;
}

async function main() {
  let input = process.argv[2];
  if (!input) {
    console.error('Usage: node check-analytics.js <url | sitemap.xml | urls.txt>');
    process.exit(1);
  }

  let urls = [];
  if (input.endsWith('.xml')) {
    // Treat as sitemap XML - add https:// if needed
    input = ensureHttps(input);
    console.log(`📋 Fetching sitemap from: ${input}`);
    urls = await getUrlsFromSitemap(input);
    console.log(`📋 Found ${urls.length} URLs in sitemap`);
  } else if (input.startsWith('http://') || input.startsWith('https://') || !input.includes('.')) {
    // Single URL passed directly - check just this one page
    // If no protocol and no file extension, treat as URL
    urls = [ensureHttps(input)];
  } else {
    // Treat as local file containing list of URLs
    urls = await getUrlsFromFile(input);
    // Ensure all URLs have https://
    urls = urls.map(ensureHttps);
  }

  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const results = [];
  
  // Group URLs by domain - same domain keeps same session
  const domainGroups = groupUrlsByDomain(urls);
  console.log(`🌐 Found ${domainGroups.size} domain(s) to check`);

  for (const [domain, domainUrls] of domainGroups) {
    console.log(`\n🔄 Starting new session for domain: ${domain} (${domainUrls.length} URLs)`);
    
    // Create new context for each domain (fresh cookies/session)
    const context = await browser.newContext();
    const page = await context.newPage();
    let cookiesAccepted = false;
    
    // Enable debug mode with --debug flag
    const debugMode = process.argv.includes('--debug');

    for (const url of domainUrls) {
      let status = 'Fail';
      let error = '';
      let launchLoaded = false;
      let pageViewFired = false;
      try {
        const firedChecker = await checkAdobeAnalytics(page, debugMode);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Only try to accept cookies once per domain
        if (!cookiesAccepted) {
          cookiesAccepted = await acceptCookies(page);
        }
        
        // Wait for possible analytics firing (longer wait after cookie accept)
        await page.waitForTimeout(cookiesAccepted ? 7000 : 5000);
        const result = firedChecker();
        launchLoaded = result.launchLoaded;
        pageViewFired = result.pageViewFired;
        status = result.passed ? 'Pass' : 'Fail';
      } catch (e) {
        error = e.message;
      }
      results.push({ url, launchLoaded: launchLoaded ? 'Yes' : 'No', pageViewFired: pageViewFired ? 'Yes' : 'No', status, error });
      console.log(`${url} -> Launch: ${launchLoaded ? '✅' : '❌'}, PageView: ${pageViewFired ? '✅' : '❌'}, Status: ${status}`);
    }
    
    await page.close();
    await context.close();
  }

  await browser.close();

  // Write CSV
  const csvWriter = createObjectCsvWriter({
    path: 'analytics-report.csv',
    header: [
      { id: 'url', title: 'URL' },
      { id: 'launchLoaded', title: 'Launch Loaded' },
      { id: 'pageViewFired', title: 'Page View Fired' },
      { id: 'status', title: 'Status' },
      { id: 'error', title: 'Error' },
    ],
  });
  await csvWriter.writeRecords(results);
  console.log('Report generated: analytics-report.csv');
}

main();

# Screenshot Comparison Tool

This tool compares screenshots between production and preview URLs to identify visual differences during migration.

## 🎯 Features

- **Automated Screenshot Capture**: Takes full-page screenshots of all URLs from the sitemap
- **Multi-Device Testing**: Tests across desktop, tablet, and mobile viewports
- **Pixel-Perfect Comparison**: Uses pixelmatch for accurate visual diff detection
- **HTML Report Generation**: Creates an interactive HTML report with side-by-side comparisons
- **Playwright Test Integration**: Provides detailed test reports with visual attachments

## 📋 Prerequisites

- Node.js v20.18.0 or higher
- npm v8.1.3 or higher

## 🚀 Installation

Install the required dependencies:

```bash
npm install
```

This will install:
- `@playwright/test` - Playwright test framework
- `playwright` - Browser automation library
- `xml2js` - XML parser for sitemap
- `pixelmatch` - Pixel-level image comparison
- `pngjs` - PNG image processing

## 📖 Usage

### Method 1: Simple Comparison Script (Recommended for Quick Tests)

This method generates an HTML report with side-by-side screenshots:

```bash
npm run screenshot-compare
```

**Output:**
- Screenshots saved in `./screenshots/` directory
  - `screenshots/prod/desktop/` - Production desktop screenshots
  - `screenshots/prod/tablet/` - Production tablet screenshots
  - `screenshots/prod/mobile/` - Production mobile screenshots
  - `screenshots/preview/desktop/` - Preview desktop screenshots
  - `screenshots/preview/tablet/` - Preview tablet screenshots
  - `screenshots/preview/mobile/` - Preview mobile screenshots
- HTML report: `./comparison-results/comparison-report.html`
- JSON summary: `./comparison-results/comparison-summary.json`

### Method 2: Playwright Test Suite (Advanced with Pixel Diff)

This method uses Playwright's test framework with pixel-perfect comparison:

```bash
npm run screenshot-compare:visual
```

Or run specific viewport tests:

```bash
# Desktop only
npx playwright test --grep "desktop"

# Mobile only
npx playwright test --grep "mobile"

# Tablet only
npx playwright test --grep "tablet"
```

**Output:**
- Screenshots saved in `./screenshots/` directory
- Playwright HTML report with visual diffs
- Diff images showing pixel differences (when differences are detected)

View the Playwright report:

```bash
npx playwright show-report
```

## ⚙️ Configuration

### Update URLs

Edit the configuration in `screenshot-comparison.js` or `screenshot-comparison.spec.js`:

```javascript
const PROD_BASE_URL = 'https://hjerteamyloidose.dk';
const PREVIEW_BASE_URL = 'https://hjerteamyloidosedk-preview.pfizerstatic.io';
```

### Customize Viewport Sizes

Modify the `VIEWPORT_SIZES` array:

```javascript
const VIEWPORT_SIZES = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 }
];
```

### Adjust Diff Threshold

In `screenshot-comparison.spec.js`, uncomment and adjust the threshold:

```javascript
// Fail if more than 5% of pixels are different
expect(parseFloat(comparison.diffPercentage)).toBeLessThan(5);
```

### Change Pixelmatch Sensitivity

Adjust the `threshold` option in the `compareImages` function:

```javascript
const numDiffPixels = pixelmatch(
  img1.data,
  img2.data,
  diff.data,
  width,
  height,
  { threshold: 0.1 } // 0.0-1.0, higher = less sensitive
);
```

## 📊 Understanding Results

### HTML Report (Method 1)

The HTML report provides:
- **Summary Statistics**: Total comparisons, successful captures, issues
- **Side-by-Side View**: Production vs Preview screenshots
- **File Sizes**: Screenshot file sizes for comparison
- **Viewport Tags**: Clear indication of which device size was tested

### Playwright Report (Method 2)

The Playwright report shows:
- **Test Status**: Pass/Fail for each URL and viewport
- **Diff Percentage**: Percentage of pixels that differ
- **Visual Attachments**: 
  - Production screenshot
  - Preview screenshot
  - Diff image (highlighted differences)

### Diff Images

Diff images use the following color coding:
- **Red/Pink**: Pixels that are different between prod and preview
- **Gray**: Pixels that are identical

## 🔧 Troubleshooting

### Timeout Issues

If pages are timing out, increase the timeout value:

```javascript
await page.goto(url, { 
  waitUntil: 'networkidle',
  timeout: 60000 // Increase from 30000 to 60000
});
```

### Memory Issues

If processing many URLs, consider:
1. Reducing the number of viewport sizes
2. Processing URLs in batches
3. Increasing Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096 npm run screenshot-compare`

### Screenshot Differences

Common causes of differences:
- **Dynamic Content**: Dates, timestamps, user-specific content
- **Animations**: Elements mid-animation
- **Fonts**: Different font rendering
- **External Resources**: CDN content, third-party scripts
- **Cookies/Sessions**: Different authentication states

To minimize false positives:
- Increase wait time: `await page.waitForTimeout(3000);`
- Hide dynamic elements: `await page.evaluate(() => { document.querySelector('.timestamp').style.display = 'none'; });`
- Mock external resources

## 📁 Directory Structure

```
project/
├── screenshot-comparison.js          # Simple comparison script
├── screenshot-comparison.spec.js     # Playwright test suite
├── playwright.config.js              # Playwright configuration
├── screenshots/                      # Screenshot storage
│   ├── prod/
│   │   ├── desktop/
│   │   ├── tablet/
│   │   └── mobile/
│   ├── preview/
│   │   ├── desktop/
│   │   ├── tablet/
│   │   └── mobile/
│   └── [viewport]/
│       ├── *_prod.png
│       ├── *_preview.png
│       └── *_diff.png
└── comparison-results/               # HTML reports
    ├── comparison-report.html
    └── comparison-summary.json
```

## 🎨 Customizing the HTML Report

Edit the `generateReport` function in `screenshot-comparison.js` to customize:
- Color scheme
- Layout
- Additional metadata
- Filtering/sorting options

## 📝 Examples

### Compare Only Specific URLs

Modify the script to filter URLs:

```javascript
const urls = await parseSitemap();
const filteredUrls = urls.filter(url => url.includes('/article/'));
```

### Add Custom Headers

```javascript
await page.setExtraHTTPHeaders({
  'Accept-Language': 'da-DK,da;q=0.9',
  'Authorization': 'Bearer token'
});
```

### Handle Cookie Consent

```javascript
await page.goto(url);
await page.click('.cookie-accept-button').catch(() => {});
await page.waitForTimeout(1000);
```

## 🚀 CI/CD Integration

### GitHub Actions Example

```yaml
name: Screenshot Comparison

on:
  pull_request:
    branches: [ main ]

jobs:
  compare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run screenshot-compare:visual
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## 📚 Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Pixelmatch Documentation](https://github.com/mapbox/pixelmatch)
- [Visual Testing Guide](https://playwright.dev/docs/test-snapshots)

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section
2. Review Playwright documentation
3. Check screenshot comparison best practices

## 📄 License

MIT

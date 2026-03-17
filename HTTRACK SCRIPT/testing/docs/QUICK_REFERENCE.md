# 📸 Screenshot Comparison - Quick Reference

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run comparison (choose one method)
npm run screenshot-compare              # HTML report (fastest)
npm run screenshot-compare:visual       # Playwright tests (detailed)
./run-comparison.sh                     # Interactive menu
node cli.js                             # CLI tool
```

## 📋 Available Commands

| Command | Description | Output |
|---------|-------------|--------|
| `npm run screenshot-compare` | Quick HTML comparison | HTML report with side-by-side screenshots |
| `npm run screenshot-compare:visual` | Playwright test suite | Interactive test report with pixel diffs |
| `./run-comparison.sh` | Interactive menu | User-friendly CLI menu |
| `node cli.js quick` | CLI HTML report | Same as npm run screenshot-compare |
| `node cli.js test` | CLI Playwright tests | Same as npm run screenshot-compare:visual |
| `node cli.js both` | Run both methods | All reports |

## 🎯 Common Use Cases

### First-Time Setup
```bash
npm install
npx playwright install chromium
npm run screenshot-compare
```

### Quick Visual Check
```bash
npm run screenshot-compare
# Open: comparison-results/comparison-report.html
```

### Detailed Pixel Comparison
```bash
npm run screenshot-compare:visual
npx playwright show-report
```

### Test Specific Viewport
```bash
# Desktop only
npx playwright test --grep "desktop"

# Mobile only
npx playwright test --grep "mobile"
```

### Test Specific URL Pattern
```bash
# Edit screenshot-comparison.spec.js to filter URLs
npx playwright test --grep "article"
```

## 📁 Output Locations

| Location | Contents |
|----------|----------|
| `screenshots/prod/` | Production screenshots |
| `screenshots/preview/` | Preview screenshots |
| `screenshots/*/desktop/` | Desktop viewport (1920x1080) |
| `screenshots/*/tablet/` | Tablet viewport (768x1024) |
| `screenshots/*/mobile/` | Mobile viewport (375x667) |
| `comparison-results/comparison-report.html` | HTML report |
| `comparison-results/comparison-summary.json` | JSON summary |
| `playwright-report/` | Playwright HTML report |

## ⚙️ Configuration Files

| File | Purpose |
|------|---------|
| `playwright.config.js` | Playwright test configuration |
| `.comparison.config` | Comparison tool settings |
| `screenshot-comparison.js` | Main comparison script |
| `screenshot-comparison.spec.js` | Playwright test suite |

## 🔧 Customization

### Change Production URL
Edit `screenshot-comparison.js` and `screenshot-comparison.spec.js`:
```javascript
const PROD_BASE_URL = 'https://your-prod-url.com';
```

### Add/Remove Viewports
```javascript
const VIEWPORT_SIZES = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'mobile', width: 375, height: 667 }
];
```

### Adjust Sensitivity
In `screenshot-comparison.spec.js`:
```javascript
pixelmatch(img1.data, img2.data, diff.data, width, height, {
  threshold: 0.1  // 0.0 (strict) to 1.0 (lenient)
});
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Timeout errors | Increase timeout in config: `timeout: 60000` |
| Memory issues | Run with more memory: `NODE_OPTIONS=--max-old-space-size=4096 npm run screenshot-compare` |
| Missing screenshots | Check if URLs are accessible, verify network connection |
| Too many diffs | Increase wait time, hide dynamic content, adjust threshold |
| Browser not found | Run `npx playwright install chromium` |

## 📊 Interpreting Results

### HTML Report
- **Green status**: Screenshot captured successfully
- **Red status**: Error capturing screenshot
- **Side-by-side**: Visual comparison of prod vs preview

### Playwright Report
- **Diff Percentage**: % of pixels that differ
- **Red/Pink areas**: Different pixels in diff image
- **Test Pass**: Screenshots captured (may have differences)
- **Test Fail**: Error or exceeded threshold (if set)

## 🎨 Report Features

### HTML Report
- ✅ Side-by-side comparison
- ✅ Summary statistics
- ✅ Responsive design
- ✅ File size information
- ✅ Easy to share

### Playwright Report
- ✅ Pixel-perfect diff images
- ✅ Interactive timeline
- ✅ Test execution details
- ✅ Attachment viewer
- ✅ Filter by status

## 📝 Tips & Best Practices

1. **Run comparisons after code changes** to catch visual regressions
2. **Test multiple viewports** to ensure responsive design works
3. **Review diff images carefully** - not all differences are bugs
4. **Set thresholds appropriately** based on your tolerance for visual changes
5. **Document known differences** (e.g., timestamps, dynamic content)
6. **Use in CI/CD** to automate visual testing
7. **Keep screenshots** for historical comparison

## 🔗 Quick Links

- Full Documentation: `SCREENSHOT_COMPARISON_README.md`
- Playwright Docs: https://playwright.dev
- Pixelmatch: https://github.com/mapbox/pixelmatch

## 💡 Example Workflow

```bash
# 1. Make changes to preview site
# 2. Run comparison
npm run screenshot-compare

# 3. Review HTML report
open comparison-results/comparison-report.html

# 4. If issues found, run detailed analysis
npm run screenshot-compare:visual

# 5. View pixel-level differences
npx playwright show-report

# 6. Fix issues and re-run
npm run screenshot-compare
```

## 📞 Support

For detailed help, see `SCREENSHOT_COMPARISON_README.md`

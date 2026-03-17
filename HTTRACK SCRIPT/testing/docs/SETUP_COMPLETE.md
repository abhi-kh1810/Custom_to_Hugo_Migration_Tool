# 📸 Screenshot Comparison Tool - Setup Complete!

## ✅ What Was Created

I've created a comprehensive Playwright screenshot comparison tool with the following components:

### 🎯 Main Scripts

1. **`screenshot-comparison.js`** - Simple HTML comparison script
   - Takes screenshots of all URLs from sitemap
   - Compares production vs preview URLs
   - Generates interactive HTML report with side-by-side comparisons
   - Tests desktop, tablet, and mobile viewports

2. **`screenshot-comparison.spec.js`** - Advanced Playwright test suite
   - Pixel-perfect comparison using pixelmatch
   - Generates diff images showing exact differences
   - Integrates with Playwright's test framework
   - Provides detailed test reports with attachments

3. **`cli.js`** - Command-line interface tool
   - Auto-installs dependencies
   - Easy-to-use commands
   - Checks for required setup

4. **`run-comparison.sh`** - Interactive bash script
   - Menu-driven interface
   - Guides users through setup
   - Runs comparisons with clear output

### ⚙️ Configuration Files

5. **`playwright.config.js`** - Playwright configuration
6. **`.comparison.config`** - Comparison tool settings
7. **`.gitignore.comparison`** - Git ignore rules for generated files

### 📚 Documentation

8. **`SCREENSHOT_COMPARISON_README.md`** - Comprehensive documentation
9. **`QUICK_REFERENCE.md`** - Quick reference card
10. **`package.json`** - Updated with new dependencies and scripts

## 🚀 How to Use

### Method 1: Quick HTML Report (Recommended for First Time)

```bash
# Install dependencies
npm install

# Install browsers
npx playwright install chromium

# Run comparison
npm run screenshot-compare

# Open the report
open comparison-results/comparison-report.html
```

### Method 2: Interactive Menu

```bash
./run-comparison.sh
```

### Method 3: CLI Tool

```bash
node cli.js quick        # HTML report
node cli.js test         # Playwright tests
node cli.js both         # Both methods
```

### Method 4: Playwright Test Suite

```bash
npm run screenshot-compare:visual
npx playwright show-report
```

## 📊 What It Does

### 1. Reads Your Sitemap
- Automatically parses `public/sitemap.xml`
- Extracts all URLs (14 URLs found in your sitemap)
- Converts preview URLs to production URLs

### 2. Takes Screenshots
For each URL, it captures screenshots at:
- **Desktop**: 1920x1080
- **Tablet**: 768x1024
- **Mobile**: 375x667

### 3. Compares Production vs Preview
- Production: `https://hjerteamyloidose.dk`
- Preview: `https://hjerteamyloidosedk-preview.pfizerstatic.io`

### 4. Generates Reports
- **HTML Report**: Side-by-side visual comparison
- **Playwright Report**: Interactive test results with pixel diffs
- **JSON Summary**: Machine-readable comparison data

## 📁 Output Structure

```
ednlt-hjerteamyloidosedk/
├── screenshots/
│   ├── prod/
│   │   ├── desktop/
│   │   │   ├── https_hjerteamyloidose_dk_.png
│   │   │   ├── https_hjerteamyloidose_dk_article_om_attr_cm.png
│   │   │   └── ...
│   │   ├── tablet/
│   │   │   └── ...
│   │   └── mobile/
│   │       └── ...
│   └── preview/
│       ├── desktop/
│       ├── tablet/
│       └── mobile/
├── comparison-results/
│   ├── comparison-report.html    # Interactive HTML report
│   └── comparison-summary.json   # JSON summary
└── playwright-report/            # Playwright test results
    └── index.html
```

## 🎯 Key Features

### ✨ HTML Comparison Report
- ✅ Beautiful, responsive design
- ✅ Side-by-side screenshot comparison
- ✅ Summary statistics
- ✅ File size information
- ✅ Easy to share with team

### 🔬 Playwright Test Suite
- ✅ Pixel-perfect comparison (using pixelmatch)
- ✅ Diff images highlighting exact differences
- ✅ Configurable difference threshold
- ✅ Integration with CI/CD pipelines
- ✅ Detailed test execution reports

### 🎨 Multi-Viewport Testing
- ✅ Desktop (1920x1080)
- ✅ Tablet (768x1024)
- ✅ Mobile (375x667)

### 🚀 Easy to Use
- ✅ Multiple ways to run (npm scripts, CLI, bash menu)
- ✅ Auto-install dependencies
- ✅ Clear documentation
- ✅ Quick reference guide

## 🔧 URLs to be Compared

Based on your sitemap, the tool will compare these URLs:

1. Homepage: `/`
2. `/article/om-attr-cm`
3. `/article/symptomer-pa-attr-cm`
4. `/article/hvordan-stilles-diagnosen`
5. `/article/andre-former-attr`
6. `/article/tal-med-din-laege`
7. `/article/livet-med-en-hjertesygdom`
8. `/article/materialer`
9. `/article/ordliste`
10. `/article/personlige-historier`
11. `/article/upplysingar-um-attr-cm-transtyretin-mylildis-hjartavodvakvilla`
12. `/forside`
13. `/om-denne-hjemmeside`
14. `/404`

**Total comparisons: 14 URLs × 3 viewports = 42 screenshot comparisons**

## 📝 Next Steps

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Install Playwright browsers**:
   ```bash
   npx playwright install chromium
   ```

3. **Run your first comparison**:
   ```bash
   npm run screenshot-compare
   ```

4. **View the results**:
   ```bash
   open comparison-results/comparison-report.html
   ```

5. **For detailed analysis**:
   ```bash
   npm run screenshot-compare:visual
   npx playwright show-report
   ```

## 🎓 Learning Resources

- **Full Documentation**: See `SCREENSHOT_COMPARISON_README.md`
- **Quick Reference**: See `QUICK_REFERENCE.md`
- **Playwright Docs**: https://playwright.dev
- **Visual Testing Guide**: https://playwright.dev/docs/test-snapshots

## 💡 Pro Tips

1. **Run after each deployment** to catch visual regressions
2. **Compare specific pages** by filtering URLs in the script
3. **Adjust sensitivity** based on your needs (dynamic content, fonts, etc.)
4. **Use in CI/CD** to automate visual testing
5. **Share HTML reports** with stakeholders for review

## 🆘 Need Help?

- **Quick issues**: Check `QUICK_REFERENCE.md` troubleshooting section
- **Detailed help**: See `SCREENSHOT_COMPARISON_README.md`
- **Playwright issues**: Check Playwright documentation

## 🎉 You're All Set!

Everything is ready to go. Just run:

```bash
npm install && npx playwright install chromium && npm run screenshot-compare
```

Happy testing! 🚀

# 🚀 How to Run Screenshot Comparison

## Quick Start (3 Steps)

### 1️⃣ Install Dependencies

```bash
npm install
```

This installs:
- Playwright for browser automation
- Image comparison libraries (pixelmatch, pngjs)
- XML parser for sitemap

### 2️⃣ Install Playwright Browsers

```bash
npx playwright install chromium
```

### 3️⃣ Run the Comparison

```bash
# Option A: Quick HTML Report (Recommended for first run)
npm run screenshot-compare

# Option B: Detailed Playwright Tests with Pixel Diff
npm run screenshot-compare:visual

# Option C: Interactive Menu
./run-comparison.sh

# Option D: CLI Tool
node cli.js
```

---

## 🌐 URL Configuration

The script is configured to:

### Fetch Sitemap From:
```
https://hjerteamyloidosedk-preview.pfizerstatic.io/sitemap.xml
```

### Compare These Environments:
- **Preview**: `https://hjerteamyloidosedk-preview.pfizerstatic.io`
- **Production**: `https://hjerteamyloidose.dk`

### How It Works:
1. Fetches sitemap.xml from the preview URL
2. Extracts all URLs from the sitemap
3. For each URL:
   - Takes screenshot of preview version
   - Converts URL to production domain
   - Takes screenshot of production version
4. Compares the screenshots

### Example URL Conversion:
```
Preview:    https://hjerteamyloidosedk-preview.pfizerstatic.io/article/om-attr-cm
            ↓
Production: https://hjerteamyloidose.dk/article/om-attr-cm
```

---

## 📊 What Gets Compared

Based on your sitemap, the tool will compare:

1. **Homepage**: `/`
2. **Article Pages**: `/article/*`
3. **Other Pages**: `/forside`, `/om-denne-hjemmeside`, etc.

For each page, it tests:
- 🖥️ **Desktop** (1920×1080)
- 📱 **Tablet** (768×1024)
- 📱 **Mobile** (375×667)

---

## 🎯 Output Locations

After running, you'll find:

### Screenshots Directory:
```
screenshots/
├── prod/
│   ├── desktop/
│   │   ├── https_hjerteamyloidose_dk_.png
│   │   ├── https_hjerteamyloidose_dk_article_om_attr_cm.png
│   │   └── ...
│   ├── tablet/
│   └── mobile/
└── preview/
    ├── desktop/
    ├── tablet/
    └── mobile/
```

### Reports:
```
comparison-results/
├── comparison-report.html      # Open this in browser
└── comparison-summary.json     # Machine-readable results
```

---

## 🔧 Changing URLs

If you need to change the URLs, edit these files:

### 1. Main Comparison Script
**File**: `screenshot-comparison.js`

```javascript
// Configuration (lines 9-11)
const SITEMAP_URL = 'https://hjerteamyloidosedk-preview.pfizerstatic.io/sitemap.xml';
const PROD_BASE_URL = 'https://hjerteamyloidose.dk';
const PREVIEW_BASE_URL = 'https://hjerteamyloidosedk-preview.pfizerstatic.io';
```

### 2. Playwright Test Suite
**File**: `screenshot-comparison.spec.js`

```javascript
// Configuration (lines 11-13)
const SITEMAP_URL = 'https://hjerteamyloidosedk-preview.pfizerstatic.io/sitemap.xml';
const PROD_BASE_URL = 'https://hjerteamyloidose.dk';
const PREVIEW_BASE_URL = 'https://hjerteamyloidosedk-preview.pfizerstatic.io';
```

### 3. Configuration File
**File**: `.comparison.config`

```bash
SITEMAP_URL=https://hjerteamyloidosedk-preview.pfizerstatic.io/sitemap.xml
PROD_BASE_URL=https://hjerteamyloidose.dk
PREVIEW_BASE_URL=https://hjerteamyloidosedk-preview.pfizerstatic.io
```

---

## 📋 Available Commands

| Command | Description |
|---------|-------------|
| `npm run screenshot-compare` | Quick HTML report with side-by-side screenshots |
| `npm run screenshot-compare:visual` | Playwright tests with pixel-perfect diff |
| `npm run screenshot-compare:desktop` | Test desktop viewport only |
| `npm run screenshot-compare:tablet` | Test tablet viewport only |
| `npm run screenshot-compare:mobile` | Test mobile viewport only |
| `npm run screenshot-report` | View Playwright report |
| `npm run screenshot-setup` | Install all dependencies |
| `npm run screenshot-quick` | CLI quick mode |
| `npm run screenshot-all` | Run both methods |

---

## 🎨 Viewing Results

### HTML Report (Method 1)
```bash
npm run screenshot-compare

# Open the report
open comparison-results/comparison-report.html
# or on Windows: start comparison-results/comparison-report.html
# or on Linux: xdg-open comparison-results/comparison-report.html
```

### Playwright Report (Method 2)
```bash
npm run screenshot-compare:visual

# View the report
npx playwright show-report
```

---

## 🐛 Troubleshooting

### "Cannot find module 'playwright'"
```bash
npm install
```

### "Browser not found"
```bash
npx playwright install chromium
```

### "Timeout waiting for navigation"
Increase timeout in the scripts:
```javascript
await page.goto(url, { 
  waitUntil: 'networkidle',
  timeout: 60000  // Increase from 30000
});
```

### "Too many differences detected"
This is normal if:
- Content has been updated
- Fonts render differently
- Dynamic elements (dates, timestamps)
- External resources load differently

---

## 💡 Pro Tips

1. **Run after each deployment** to catch visual regressions
2. **Start with one viewport** if testing many URLs:
   ```bash
   npm run screenshot-compare:mobile
   ```
3. **Check network tab** if screenshots are blank - URLs might be inaccessible
4. **Review diff images carefully** - not all differences are bugs
5. **Use in CI/CD** to automate visual testing

---

## 📖 More Information

- **Full Documentation**: See `SCREENSHOT_COMPARISON_README.md`
- **Quick Reference**: See `QUICK_REFERENCE.md`
- **Workflow Diagram**: See `WORKFLOW.md`

---

## ✅ Complete Example

```bash
# 1. First time setup
npm install
npx playwright install chromium

# 2. Run quick comparison
npm run screenshot-compare

# 3. Open report in browser
open comparison-results/comparison-report.html

# 4. Review results
# - Green = Captured successfully
# - Red = Issues
# - Compare side-by-side screenshots

# 5. If you need pixel-perfect analysis
npm run screenshot-compare:visual
npx playwright show-report
```

That's it! 🎉

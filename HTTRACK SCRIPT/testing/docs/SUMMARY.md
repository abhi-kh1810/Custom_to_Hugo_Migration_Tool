# 🎯 Testing Made Configurable - Summary

## What Changed?

Your screenshot comparison tool is now **fully configurable** and can handle **100+ sites** easily!

### Before
- Hardcoded URLs in the scripts
- Had to edit code to change sites
- Only one site at a time
- Manual viewport management

### After
- ✅ Configuration-driven (JSON/CSV)
- ✅ Test multiple sites in one run
- ✅ Easy enable/disable sites
- ✅ Flexible viewport control
- ✅ Batch testing support
- ✅ CLI management tools

## New Files Created

| File | Purpose |
|------|---------|
| **`config.json`** | Main configuration file (sites, viewports, settings) |
| **`config-generator.js`** | Generate config.json from CSV file |
| **`sites-template.csv`** | Example CSV format for bulk site import |
| **`manage-sites.js`** | CLI tool to manage sites configuration |
| **`CONFIG_GUIDE.md`** | Complete configuration documentation |
| **`MULTI_SITE_REFERENCE.md`** | Quick reference for bulk operations |
| **`CONFIGURATION_COMPLETE.md`** | Getting started guide |

## Modified Files

| File | Changes |
|------|---------|
| **`screenshot-comparison.js`** | Now reads from config.json, supports multiple sites |
| **`screenshot-comparison.spec.js`** | Now reads from config.json, generates tests per site |
| **`cli.js`** | Shows configuration summary on startup |

## How to Use

### 1️⃣ Quick Test (Current Setup)

The tool is already configured with 2 sites (desktop only):

```bash
node cli.js
```

### 2️⃣ Add Your 100 Sites

**Option A: Using CSV (Recommended)**

1. Create `my-sites.csv`:
```csv
name,previewUrl,prodUrl,enabled
site1,https://site1-preview.pfizerstatic.io,https://www.site1.com,true
site2,https://site2-preview.pfizerstatic.io,https://www.site2.com,true
...all 100 sites...
```

2. Generate config:
```bash
node config-generator.js my-sites.csv
```

3. Run tests:
```bash
node cli.js
```

**Option B: Edit config.json directly**

Add sites to the `sites` array in `config.json`.

### 3️⃣ Manage Sites

```bash
# List all sites
node manage-sites.js list

# Enable sites 1-20 only
node manage-sites.js enable-range 1 20

# Enable specific sites
node manage-sites.js enable site1,site5,site10

# Disable all sites
node manage-sites.js disable-all

# View test statistics
node manage-sites.js stats
```

### 4️⃣ Configure Viewports

```bash
# Enable tablet testing
node manage-sites.js viewport tablet true

# Enable mobile testing
node manage-sites.js viewport mobile true

# List viewports
node manage-sites.js viewports
```

Or edit `config.json`:
```json
"viewports": {
  "desktop": { "width": 1920, "height": 1080, "enabled": true },
  "tablet": { "width": 768, "height": 1024, "enabled": true },
  "mobile": { "width": 375, "height": 667, "enabled": true }
}
```

## Example Workflows

### Test Desktop Only (Current Setup)
```bash
# Already configured!
node cli.js
```

### Test 5 Sites (Desktop Only)
```bash
# Enable only 5 sites
node manage-sites.js enable-range 1 5

# Run tests
node cli.js

# View results
open comparison-results/comparison-report.html
```

### Test All Sites in Batches
```bash
# Batch 1: Sites 1-20
node manage-sites.js enable-range 1 20
node cli.js

# Batch 2: Sites 21-40
node manage-sites.js enable-range 21 40
node cli.js

# Continue for all batches...
```

### Test All Viewports for One Site
```bash
# Enable only one site
node manage-sites.js disable-all
node manage-sites.js enable site1

# Enable all viewports
node manage-sites.js viewport desktop true
node manage-sites.js viewport tablet true
node manage-sites.js viewport mobile true

# Run tests
node cli.js
```

## Configuration Structure

### config.json
```json
{
  "sites": [
    {
      "name": "unique-name",
      "previewUrl": "https://preview.url",
      "prodUrl": "https://production.url",
      "enabled": true
    }
  ],
  "viewports": {
    "desktop": { "width": 1920, "height": 1080, "enabled": true },
    "tablet": { "width": 768, "height": 1024, "enabled": false },
    "mobile": { "width": 375, "height": 667, "enabled": false }
  },
  "settings": {
    "screenshotsDir": "./screenshots",
    "comparisonDir": "./comparison-results",
    "timeout": 30000,
    "waitAfterLoad": 2000,
    "fullPage": true,
    "pixelmatchThreshold": 0.1
  }
}
```

## Output Structure

```
screenshots/
├── site1/
│   ├── prod/
│   │   ├── desktop/
│   │   │   ├── page1.png
│   │   │   └── page2.png
│   │   ├── tablet/
│   │   └── mobile/
│   └── preview/
│       ├── desktop/
│       ├── tablet/
│       └── mobile/
├── site2/
│   ├── prod/
│   └── preview/
└── ...

comparison-results/
├── comparison-report.html      ← Open this in browser
└── comparison-summary.json     ← JSON data for analysis
```

## Commands Cheat Sheet

```bash
# Configuration
node config-generator.js sites.csv          # Generate config from CSV
node manage-sites.js list                   # List all sites
node manage-sites.js stats                  # Show test statistics
node manage-sites.js viewports              # List viewports

# Enable/Disable Sites
node manage-sites.js enable-all             # Enable all sites
node manage-sites.js disable-all            # Disable all sites
node manage-sites.js enable-range 1 20      # Enable sites 1-20
node manage-sites.js enable site1,site2     # Enable specific sites
node manage-sites.js disable site3,site4    # Disable specific sites

# Viewports
node manage-sites.js viewport desktop true  # Enable desktop
node manage-sites.js viewport tablet true   # Enable tablet
node manage-sites.js viewport mobile true   # Enable mobile

# Run Tests
node cli.js                                 # HTML report
node cli.js test                            # Playwright tests
node cli.js both                            # Both methods

# View Results
open comparison-results/comparison-report.html
npx playwright show-report

# Clean Up
rm -rf screenshots/* comparison-results/*
```

## Performance Estimates

For **100 sites** with **desktop only**:
- Average pages per site: ~10-20
- Time per page: ~5-10 seconds
- **Total time: 2-4 hours** (depending on page complexity)

Tips for faster testing:
1. Test in batches (20-30 sites at a time)
2. Use parallel workers (edit `playwright.config.js`)
3. Disable `fullPage` screenshots if not needed
4. Test only changed sites

## Documentation

- **`CONFIG_GUIDE.md`** - Detailed configuration guide with examples
- **`MULTI_SITE_REFERENCE.md`** - Quick reference for managing 100+ sites
- **`CONFIGURATION_COMPLETE.md`** - Getting started guide
- **`SCREENSHOT_COMPARISON_README.md`** - Original tool documentation

## Support

Need help? Check the documentation above or run:
```bash
node manage-sites.js          # Site management help
node cli.js help              # Testing help
```

## What's Next?

1. ✅ Tool is configured with 2 example sites
2. ✅ Add your 100 sites (CSV or JSON)
3. ✅ Run tests: `node cli.js`
4. ✅ View results: `open comparison-results/comparison-report.html`

---

**You're all set!** The tool is now fully configurable and ready to test 100+ sites. 🚀

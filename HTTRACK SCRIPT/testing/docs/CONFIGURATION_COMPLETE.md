# 🎉 Configuration Complete!

Your screenshot comparison tool is now **fully configurable** for testing 100+ sites!

## What's New

✅ **Multi-site support** - Test unlimited sites in one run  
✅ **Flexible configuration** - JSON or CSV-based setup  
✅ **Viewport control** - Enable/disable desktop, tablet, mobile  
✅ **Easy management** - Enable/disable sites without code changes  
✅ **Organized output** - Screenshots grouped by site, environment, viewport  
✅ **Batch testing** - Test sites in groups for better management  

## Quick Start

### 1. Configure Your Sites

**Option A: Edit config.json directly**
```bash
nano config.json
```

**Option B: Use CSV (recommended for 100 sites)**
```bash
# Create your CSV file
nano sites.csv

# Generate config
node config-generator.js sites.csv
```

### 2. Run Tests

```bash
# Desktop only (default)
node cli.js

# Or with Playwright
node cli.js test
```

### 3. View Results

```bash
open comparison-results/comparison-report.html
```

## Example: Test 2 Sites (Desktop Only)

Your current `config.json` is already set up:
```json
{
  "sites": [
    {
      "name": "hjerteamyloidose",
      "previewUrl": "https://hjerteamyloidosedk-preview.pfizerstatic.io",
      "prodUrl": "https://hjerteamyloidose.dk",
      "enabled": true
    },
    {
      "name": "meandmbc",
      "previewUrl": "https://pfelmeandmbcgr-preview.pfizerstatic.io",
      "prodUrl": "https://www.meandmbc.gr",
      "enabled": true
    }
  ],
  "viewports": {
    "desktop": { "enabled": true },
    "tablet": { "enabled": false },
    "mobile": { "enabled": false }
  }
}
```

**Run:**
```bash
node cli.js
```

## Adding Your 100 Sites

### Method 1: CSV File (Easiest)

1. Create `sites.csv`:
```csv
name,previewUrl,prodUrl,enabled
site1,https://site1-preview.pfizerstatic.io,https://www.site1.com,true
site2,https://site2-preview.pfizerstatic.io,https://www.site2.com,true
site3,https://site3-preview.pfizerstatic.io,https://www.site3.com,true
... (add all 100 sites)
```

2. Generate config:
```bash
node config-generator.js sites.csv
```

3. Run tests:
```bash
node cli.js
```

### Method 2: Edit config.json

Add sites to the `sites` array in `config.json`:
```json
{
  "sites": [
    {"name": "site1", "previewUrl": "...", "prodUrl": "...", "enabled": true},
    {"name": "site2", "previewUrl": "...", "prodUrl": "...", "enabled": true},
    ... (add all 100)
  ]
}
```

## Batch Testing (Recommended for 100 Sites)

Instead of testing all 100 at once, test in batches:

```bash
# Test sites 1-20
# Set enabled=true for sites 1-20, false for others
node cli.js

# Test sites 21-40
# Set enabled=true for sites 21-40, false for others
node cli.js

# Continue...
```

## Key Files

| File | Purpose |
|------|---------|
| `config.json` | Main configuration (sites, viewports, settings) |
| `config-generator.js` | Convert CSV to config.json |
| `sites-template.csv` | Example CSV format |
| `CONFIG_GUIDE.md` | Detailed configuration guide |
| `MULTI_SITE_REFERENCE.md` | Quick reference for 100 sites |
| `screenshot-comparison.js` | Main comparison script |
| `screenshot-comparison.spec.js` | Playwright test suite |
| `cli.js` | Command-line interface |

## Documentation

- **`CONFIG_GUIDE.md`** - Full configuration documentation
- **`MULTI_SITE_REFERENCE.md`** - Quick commands for managing 100 sites
- **`SCREENSHOT_COMPARISON_README.md`** - Original tool documentation

## Commands

```bash
# Generate config from CSV
node config-generator.js sites.csv

# Run tests
node cli.js              # HTML report
node cli.js test         # Playwright tests
node cli.js both         # Both methods

# View results
open comparison-results/comparison-report.html
npx playwright show-report

# Help
node cli.js help
```

## Next Steps

1. ✅ Review current config: `cat config.json`
2. ✅ Add your sites (CSV or JSON)
3. ✅ Run a test: `node cli.js`
4. ✅ View the report: `open comparison-results/comparison-report.html`

## Support

- See `CONFIG_GUIDE.md` for detailed examples
- See `MULTI_SITE_REFERENCE.md` for bulk operations
- Configuration structure is fully extensible

---

**Ready to test!** Run `node cli.js` to start comparing your sites.

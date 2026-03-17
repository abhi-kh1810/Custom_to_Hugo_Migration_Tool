# Configuration Guide

This testing suite now supports **configurable multi-site testing** with flexible viewport options.

## Quick Start

### Method 1: Edit config.json directly

Edit `config.json` to add/remove sites and configure viewports:

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
    "desktop": { "width": 1920, "height": 1080, "enabled": true },
    "tablet": { "width": 768, "height": 1024, "enabled": false },
    "mobile": { "width": 375, "height": 667, "enabled": false }
  }
}
```

### Method 2: Use CSV file (Recommended for 100 sites)

1. Create a CSV file `sites.csv`:

```csv
name,previewUrl,prodUrl,enabled
site1,https://site1-preview.pfizerstatic.io,https://www.site1.com,true
site2,https://site2-preview.pfizerstatic.io,https://www.site2.com,true
site3,https://site3-preview.pfizerstatic.io,https://www.site3.com,false
```

2. Generate config from CSV:

```bash
node config-generator.js sites.csv
```

3. Run tests:

```bash
node cli.js
```

## Configuration Options

### Sites Configuration

Each site requires:
- **name**: Unique identifier for the site (used in reports and file paths)
- **previewUrl**: The preview/staging environment URL
- **prodUrl**: The production environment URL
- **enabled**: `true` to test, `false` to skip

### Viewports Configuration

Control which screen sizes to test:
- **desktop**: 1920x1080 (default: enabled)
- **tablet**: 768x1024 (default: disabled)
- **mobile**: 375x667 (default: disabled)

Set `"enabled": true` to test that viewport.

### Settings

Fine-tune test behavior:

```json
"settings": {
  "screenshotsDir": "./screenshots",
  "comparisonDir": "./comparison-results",
  "timeout": 30000,              // Page load timeout (ms)
  "waitAfterLoad": 2000,          // Wait after load for animations (ms)
  "fullPage": true,               // Capture full page scrolling
  "pixelmatchThreshold": 0.1      // Pixel difference threshold (0-1)
}
```

## Running Tests

### Test All Enabled Sites

```bash
node cli.js                    # Quick HTML report
node cli.js test               # Playwright test suite
node cli.js both               # Run both methods
```

### Test Only Desktop

Edit `config.json`:

```json
"viewports": {
  "desktop": { "width": 1920, "height": 1080, "enabled": true },
  "tablet": { "width": 768, "height": 1024, "enabled": false },
  "mobile": { "width": 375, "height": 667, "enabled": false }
}
```

### Test Specific Sites

Set `"enabled": false` for sites you want to skip:

```json
{
  "name": "site3",
  "previewUrl": "https://site3-preview.pfizerstatic.io",
  "prodUrl": "https://www.site3.com",
  "enabled": false
}
```

## Managing 100 Sites

### Using Excel/Google Sheets

1. Create spreadsheet with columns: `name`, `previewUrl`, `prodUrl`, `enabled`
2. Export as CSV
3. Generate config: `node config-generator.js your-sites.csv`

### Bulk Operations

**Enable all sites:**
```bash
# Use jq (install: brew install jq)
jq '.sites[].enabled = true' config.json > config-temp.json && mv config-temp.json config.json
```

**Disable all sites:**
```bash
jq '.sites[].enabled = false' config.json > config-temp.json && mv config-temp.json config.json
```

**Enable specific sites by name:**
```bash
jq '(.sites[] | select(.name == "site1" or .name == "site2")).enabled = true' config.json > config-temp.json && mv config-temp.json config.json
```

## Output Structure

Screenshots are organized by site, environment, and viewport:

```
screenshots/
├── site1/
│   ├── prod/
│   │   ├── desktop/
│   │   ├── tablet/
│   │   └── mobile/
│   └── preview/
│       ├── desktop/
│       ├── tablet/
│       └── mobile/
└── site2/
    ├── prod/
    └── preview/
```

## Report

The HTML report groups comparisons by site for easy navigation:

```
comparison-results/
├── comparison-report.html      # Visual comparison report
└── comparison-summary.json     # JSON data for further processing
```

## Tips for 100 Sites

1. **Start small**: Test with 5-10 sites first
2. **Use CSV management**: Excel/Sheets easier than editing JSON
3. **Run in batches**: Enable 20-30 sites at a time
4. **Monitor resources**: Each site takes ~2-5 minutes per viewport
5. **Parallel workers**: Edit `playwright.config.js` to increase workers:
   ```js
   workers: 4  // Run 4 sites in parallel
   ```

## Troubleshooting

**Too many sites timing out?**
- Increase `timeout` in settings
- Reduce number of enabled sites
- Check network connection

**Screenshots look different?**
- Increase `waitAfterLoad` for slow-loading sites
- Check if sites have animations or dynamic content

**Running out of disk space?**
- Screenshots can be large (1-5MB each)
- Clean old results: `rm -rf screenshots/* comparison-results/*`

## Examples

### Test 5 specific sites (desktop only)

`config.json`:
```json
{
  "sites": [
    {"name": "site1", "previewUrl": "...", "prodUrl": "...", "enabled": true},
    {"name": "site2", "previewUrl": "...", "prodUrl": "...", "enabled": true},
    {"name": "site3", "previewUrl": "...", "prodUrl": "...", "enabled": true},
    {"name": "site4", "previewUrl": "...", "prodUrl": "...", "enabled": true},
    {"name": "site5", "previewUrl": "...", "prodUrl": "...", "enabled": true}
  ],
  "viewports": {
    "desktop": {"enabled": true},
    "tablet": {"enabled": false},
    "mobile": {"enabled": false}
  }
}
```

Run: `node cli.js`

### Test all viewports for 2 sites

Enable all viewports in config, disable all but 2 sites, then run: `node cli.js`

## Advanced: Custom Viewport Sizes

Add custom viewports to `config.json`:

```json
"viewports": {
  "desktop": {"width": 1920, "height": 1080, "enabled": true},
  "laptop": {"width": 1440, "height": 900, "enabled": true},
  "ipad_pro": {"width": 1024, "height": 1366, "enabled": true},
  "iphone_14": {"width": 390, "height": 844, "enabled": true}
}
```

The system will automatically use all enabled viewports.

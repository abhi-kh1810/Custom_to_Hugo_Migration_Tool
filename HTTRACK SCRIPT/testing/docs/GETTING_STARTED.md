# 🚀 Getting Started - Multi-Site Testing

## Your Tool is Ready!

The screenshot comparison tool is now configured and ready to test multiple sites. Currently configured for **desktop only** testing.

## Current Configuration

✅ **2 sites configured:**
- `hjerteamyloidose` (enabled)
- `meandmbc` (enabled)

✅ **1 viewport enabled:**
- Desktop (1920×1080)

✅ **Settings:**
- Screenshots: Full page
- Timeout: 30 seconds
- Wait after load: 2 seconds

## Quick Test Run

### Step 1: Test Current Setup

```bash
# Run the comparison
node cli.js

# Wait for completion (may take 5-10 minutes depending on sitemap size)
# You'll see progress in the console
```

### Step 2: View Results

```bash
# Open the HTML report
open comparison-results/comparison-report.html
```

The report will show:
- Side-by-side comparison of preview vs production
- Screenshots grouped by site
- File sizes and status for each comparison

## Adding More Sites

### Method 1: CSV File (Best for 100 sites)

1. **Create a CSV file** (`my-100-sites.csv`):

```csv
name,previewUrl,prodUrl,enabled
site1,https://site1-preview.pfizerstatic.io,https://www.site1.com,true
site2,https://site2-preview.pfizerstatic.io,https://www.site2.com,true
site3,https://site3-preview.pfizerstatic.io,https://www.site3.com,true
...add all 100 sites...
```

2. **Generate config:**

```bash
node config-generator.js my-100-sites.csv
```

3. **Run tests:**

```bash
node cli.js
```

### Method 2: Edit config.json Directly

Open `config.json` and add sites to the `sites` array:

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
    },
    {
      "name": "your-new-site",
      "previewUrl": "https://yoursite-preview.pfizerstatic.io",
      "prodUrl": "https://www.yoursite.com",
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

## Managing Sites

### View All Sites

```bash
node manage-sites.js list
```

Output:
```
📊 Sites Configuration:

Total sites: 2
Enabled: 2
Disabled: 0

1. [✓] hjerteamyloidose
   Preview: https://hjerteamyloidosedk-preview.pfizerstatic.io
   Prod: https://hjerteamyloidose.dk

2. [✓] meandmbc
   Preview: https://pfelmeandmbcgr-preview.pfizerstatic.io
   Prod: https://www.meandmbc.gr
```

### Enable/Disable Sites

```bash
# Enable only first 20 sites
node manage-sites.js enable-range 1 20

# Disable all sites
node manage-sites.js disable-all

# Enable specific sites
node manage-sites.js enable site1,site5,site10

# Disable specific sites
node manage-sites.js disable site2,site3
```

### View Test Statistics

```bash
node manage-sites.js stats
```

Output:
```
📊 Test Statistics:

Sites to test: 2
Viewports: desktop

Estimated comparisons:
  hjerteamyloidose: ~1 viewports × pages in sitemap
  meandmbc: ~1 viewports × pages in sitemap

Total viewport comparisons: 2
(Each site may have multiple pages from sitemap)
```

## Testing Different Viewports

### Enable Tablet Testing

```bash
node manage-sites.js viewport tablet true
```

Or edit `config.json`:
```json
"viewports": {
  "desktop": { "width": 1920, "height": 1080, "enabled": true },
  "tablet": { "width": 768, "height": 1024, "enabled": true },  ← Changed
  "mobile": { "width": 375, "height": 667, "enabled": false }
}
```

### Enable All Viewports

```bash
node manage-sites.js viewport desktop true
node manage-sites.js viewport tablet true
node manage-sites.js viewport mobile true
```

## Testing Strategies for 100 Sites

### Strategy 1: Batch Testing (Recommended)

Test sites in groups of 20:

```bash
# Batch 1: Sites 1-20
node manage-sites.js enable-range 1 20
node cli.js

# Batch 2: Sites 21-40
node manage-sites.js enable-range 21 40
node cli.js

# Continue for all batches...
```

### Strategy 2: Priority Testing

Test most important sites first:

```bash
# Enable only critical sites
node manage-sites.js disable-all
node manage-sites.js enable site1,site2,site5,site10
node cli.js
```

### Strategy 3: Incremental Testing

Test one viewport at a time for all sites:

```bash
# Desktop only (current setup)
node manage-sites.js viewport desktop true
node manage-sites.js viewport tablet false
node manage-sites.js viewport mobile false
node cli.js

# Then tablet
node manage-sites.js viewport desktop false
node manage-sites.js viewport tablet true
node manage-sites.js viewport mobile false
node cli.js

# Finally mobile
node manage-sites.js viewport desktop false
node manage-sites.js viewport tablet false
node manage-sites.js viewport mobile true
node cli.js
```

## Understanding Output

### Console Output

During testing, you'll see:
```
🚀 Starting screenshot comparison...

📋 Configuration:
   - Sites: 2 enabled
   - Viewports: desktop

🌐 Processing site: hjerteamyloidose
   Preview: https://hjerteamyloidosedk-preview.pfizerstatic.io
   Production: https://hjerteamyloidose.dk
   Found 15 URLs in sitemap

   📱 Processing desktop viewport (1920x1080)...
      Processing: https://hjerteamyloidose.dk
✓ Screenshot saved: hjerteamyloidose/prod/desktop/page.png
✓ Screenshot saved: hjerteamyloidose/preview/desktop/page.png
...

✅ Screenshot comparison complete!
```

### File Structure

```
screenshots/
├── hjerteamyloidose/
│   ├── prod/
│   │   └── desktop/
│   │       ├── page1.png
│   │       ├── page2.png
│   │       └── ...
│   └── preview/
│       └── desktop/
│           ├── page1.png
│           ├── page2.png
│           └── ...
└── meandmbc/
    ├── prod/
    └── preview/

comparison-results/
├── comparison-report.html      ← Open this!
└── comparison-summary.json
```

## Troubleshooting

### "config.json not found"

Create it from template:
```bash
node config-generator.js sites-template.csv
```

### Tests Taking Too Long

Increase timeout in `config.json`:
```json
"settings": {
  "timeout": 60000,        ← Increase from 30000
  "waitAfterLoad": 3000    ← Increase from 2000
}
```

### Sites Failing to Load

Check the sitemap URL exists:
```bash
curl https://yoursite-preview.pfizerstatic.io/sitemap.xml
```

### Out of Disk Space

Screenshots can be large. Clean up regularly:
```bash
rm -rf screenshots/* comparison-results/*
```

## Performance Tips

### Test Fewer Pages Per Site

The tool tests all URLs in the sitemap. To test fewer pages, you can:
1. Create a custom sitemap with only important pages
2. Modify the site's sitemap temporarily

### Use Parallel Workers

Edit `playwright.config.js`:
```js
module.exports = defineConfig({
  workers: 4,  // Run 4 sites in parallel (default: 1)
  ...
});
```

### Disable Full-Page Screenshots

Edit `config.json`:
```json
"settings": {
  "fullPage": false  ← Faster, captures only visible area
}
```

## Next Steps

1. ✅ Run your first test: `node cli.js`
2. ✅ View the results: `open comparison-results/comparison-report.html`
3. ✅ Add your 100 sites (CSV or JSON)
4. ✅ Test in batches: `node manage-sites.js enable-range 1 20`

## Need More Help?

- **Complete configuration guide:** [CONFIG_GUIDE.md](CONFIG_GUIDE.md)
- **Quick reference for 100 sites:** [MULTI_SITE_REFERENCE.md](MULTI_SITE_REFERENCE.md)
- **Full summary:** [SUMMARY.md](SUMMARY.md)
- **Command reference:** Run `node manage-sites.js` or `node cli.js help`

---

**Ready to go!** 🚀 Run `node cli.js` to start testing.

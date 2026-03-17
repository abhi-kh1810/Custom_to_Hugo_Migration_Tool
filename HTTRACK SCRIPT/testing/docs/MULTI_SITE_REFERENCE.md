# Quick Reference: Managing Multiple Sites

## Setup (One Time)

### Create your sites list
```bash
# Create CSV with your 100 sites
nano sites.csv
```

CSV format:
```csv
name,previewUrl,prodUrl,enabled
site1,https://site1-preview.pfizerstatic.io,https://www.site1.com,true
site2,https://site2-preview.pfizerstatic.io,https://www.site2.com,true
...
```

### Generate config
```bash
node config-generator.js sites.csv
```

## Running Tests

### All enabled sites (desktop only)
```bash
node cli.js
```

### Playwright test suite
```bash
node cli.js test
```

### Both methods
```bash
node cli.js both
```

## Enable/Disable Viewports

Edit `config.json`:
```json
"viewports": {
  "desktop": { "enabled": true },   ← Change to false to disable
  "tablet": { "enabled": false },
  "mobile": { "enabled": false }
}
```

## Enable/Disable Sites

### In CSV
```csv
name,previewUrl,prodUrl,enabled
site1,https://...,https://...,true     ← Set to false to disable
site2,https://...,https://...,false    ← Disabled
```
Then regenerate: `node config-generator.js sites.csv`

### In config.json
```json
{
  "name": "site1",
  "previewUrl": "...",
  "prodUrl": "...",
  "enabled": false  ← Change this
}
```

## Bulk Operations (with jq)

Install jq: `brew install jq` (Mac) or `sudo apt-get install jq` (Linux)

### Enable all sites
```bash
jq '.sites[].enabled = true' config.json > temp.json && mv temp.json config.json
```

### Disable all sites
```bash
jq '.sites[].enabled = false' config.json > temp.json && mv temp.json config.json
```

### Enable first 10 sites only
```bash
jq '.sites[:10][].enabled = true | .sites[10:][].enabled = false' config.json > temp.json && mv temp.json config.json
```

### Enable sites 20-30
```bash
jq '.sites[].enabled = false | .sites[20:30][].enabled = true' config.json > temp.json && mv temp.json config.json
```

### Enable specific sites by name
```bash
jq '(.sites[] | select(.name == "site1" or .name == "site5")).enabled = true' config.json > temp.json && mv temp.json config.json
```

## Testing Strategy for 100 Sites

### Batch Testing (Recommended)
```bash
# Test sites 1-20
# Edit config.json to enable sites 1-20, disable others
node cli.js

# Test sites 21-40
# Edit config.json to enable sites 21-40, disable others
node cli.js

# Continue for all batches...
```

### Use a script
Create `batch-test.sh`:
```bash
#!/bin/bash
BATCH_SIZE=20
TOTAL_SITES=100

for ((i=0; i<TOTAL_SITES; i+=BATCH_SIZE)); do
  END=$((i+BATCH_SIZE))
  echo "Testing sites $i to $END..."
  
  # Enable only this batch
  jq --argjson start "$i" --argjson end "$END" \
    '.sites = (.sites | to_entries | map(
      if .key >= $start and .key < $end then .value.enabled = true 
      else .value.enabled = false end
    ) | map(.value))' config.json > temp.json && mv temp.json config.json
  
  # Run tests
  node cli.js
  
  echo "Batch complete. Sleeping 10 seconds..."
  sleep 10
done
```

Run: `chmod +x batch-test.sh && ./batch-test.sh`

## File Organization

After running tests:
```
screenshots/
├── site1/
│   ├── prod/desktop/
│   └── preview/desktop/
├── site2/
│   ├── prod/desktop/
│   └── preview/desktop/
└── site100/
    ├── prod/desktop/
    └── preview/desktop/

comparison-results/
├── comparison-report.html    ← Open this in browser
└── comparison-summary.json   ← JSON data
```

## View Results

### HTML Report
```bash
open comparison-results/comparison-report.html
```
Or on Linux:
```bash
xdg-open comparison-results/comparison-report.html
```

### Playwright Report
```bash
npx playwright show-report
```

## Clean Up

### Delete all screenshots
```bash
rm -rf screenshots/*
```

### Delete comparison results
```bash
rm -rf comparison-results/*
```

### Delete everything
```bash
rm -rf screenshots/* comparison-results/* test-results/*
```

## Common Issues

### "Too many open files" error
```bash
# Increase file limit (Mac)
ulimit -n 4096

# Add to ~/.zshrc or ~/.bashrc
echo "ulimit -n 4096" >> ~/.zshrc
```

### Tests timing out
Edit `config.json`:
```json
"settings": {
  "timeout": 60000,        ← Increase from 30000
  "waitAfterLoad": 3000    ← Increase from 2000
}
```

### Out of disk space
Screenshots can be 1-5MB each. For 100 sites with 3 viewports and ~20 pages each:
- Total screenshots: 100 × 3 × 20 × 2 = 12,000 files
- Disk space needed: ~30-60 GB

Clean old results regularly!

## Performance Tips

### Parallel execution
Edit `playwright.config.js`:
```js
workers: 4  // Test 4 sites simultaneously
```

### Disable full-page screenshots
Edit `config.json`:
```json
"settings": {
  "fullPage": false  ← Faster, but only captures visible area
}
```

### Run headless only
Already enabled by default for speed.

## Quick Commands Summary

```bash
# Setup
node config-generator.js sites.csv

# Run tests
node cli.js                    # Quick HTML report
node cli.js test               # Playwright tests
node cli.js both               # Both methods

# View results
open comparison-results/comparison-report.html
npx playwright show-report

# Clean up
rm -rf screenshots/* comparison-results/*

# Batch operations (with jq)
jq '.sites[:20][].enabled = true' config.json > temp.json && mv temp.json config.json
```

## Need Help?

See full documentation:
- `CONFIG_GUIDE.md` - Detailed configuration guide
- `SCREENSHOT_COMPARISON_README.md` - Original documentation
- `WORKFLOW.md` - Testing workflow

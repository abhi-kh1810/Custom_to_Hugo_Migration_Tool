# Testing Suite

This directory contains automated testing tools for website migration and validation.

## Directory Structure

```
testing/
├── screenshot-tests/       # Visual regression testing
├── sitemap-tests/          # URL validation and link checking
├── docs/                   # Detailed documentation
├── node_modules/           # Dependencies
└── package.json            # Project configuration
```

## Testing Tools

### 1. Screenshot Comparison Tests
**Location:** `screenshot-tests/`

**Purpose:** Compare visual differences between production and preview environments

**Quick Start:**
```bash
cd screenshot-tests
node cli.js
```

**Features:**
- Multi-site screenshot comparison
- Multiple viewport testing (desktop, tablet, mobile)
- HTML comparison reports with side-by-side views
- Pixel-perfect diff detection

**Documentation:** See `screenshot-tests/` or `docs/` for detailed guides

---

### 2. Sitemap & Link Validation Tests
**Location:** `sitemap-tests/`

**Purpose:** Validate URLs, check for broken links, and compare sitemaps between environments

**Quick Start:**
```bash
cd sitemap-tests
./compare_sitemap_urls.sh input.csv output.csv
```

**Features:**
- Sitemap URL comparison between production and preview
- Broken link detection and reporting
- HTTP status code validation
- Batch processing for multiple sites

**Documentation:** See `sitemap-tests/README.md` and `sitemap-tests/CHECK-LINKS-README.md`

---

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers (for screenshot tests)
npx playwright install chromium
```

## Quick Commands

### Screenshot Tests
```bash
cd screenshot-tests
node cli.js                    # Interactive CLI
node screenshot-comparison.js  # Generate HTML report
npm run test:visual            # Run Playwright tests
npm run report                 # View test report
```

### Sitemap Tests
```bash
cd sitemap-tests
./compare_sitemap_urls.sh input.csv output.csv  # Compare sitemaps
node check-links.js                              # Check for broken links
```

## Documentation

- **Screenshot Testing:** `docs/SUMMARY.md`, `docs/CONFIG_GUIDE.md`, `docs/HOW_TO_RUN.md`
- **Sitemap Testing:** `sitemap-tests/README.md`, `sitemap-tests/CHECK-LINKS-README.md`
- **Configuration:** `docs/CONFIG_GUIDE.md`, `docs/CONFIGURATION_COMPLETE.md`
- **Workflow:** `docs/WORKFLOW.md`

## Common Use Cases

### Test a single site visually
```bash
cd screenshot-tests
node cli.js quick
```

### Test 100+ sites
```bash
cd screenshot-tests
node config-generator.js sites.csv
node manage-sites.js enable-range 1 100
node cli.js
```

### Validate URLs across environments
```bash
cd sitemap-tests
./compare_sitemap_urls.sh domains.csv results.csv
```

### Find broken links
```bash
cd sitemap-tests
node check-links.js
```

## Support

For detailed documentation, see the `docs/` directory or the README files in each test folder.

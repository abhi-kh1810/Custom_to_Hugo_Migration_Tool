# Sitemap Generation Guide

## Overview
The `generate-sitemap.js` script automatically generates an XML sitemap for your website. The sitemap helps search engines discover and index all pages on the site.

## How It Works
The script:
1. Scans the `public/` directory for all `index.html` files
2. Excludes technical directories (css, js, images, files, cdn-cgi, errors, unprocessed)
3. Applies custom exclusion rules from `exclude_path` configuration
4. Includes additional paths from `additional_path` configuration (for non-existing paths)
5. Generates a sitemap with proper URL structure, lastmod dates, and priorities
6. Saves the output to `public/sitemap.xml`

## Configuration

### 1. Update `edison.yml`
Add the production domain configuration in the `public_data` section:

```yaml
public_data:
    default:
        site_url: https://yoursite-previews.pfizerstatic.io
    live:
        site_url: https://www.yoursite.com
    test:
        site_url: https://yoursite-test.pfizerstatic.io
```

### 2. Create `public_data.json`
Create a `public_data.json` file in the root folder with the production domain and optional configuration:

```json
{
    "site_url": "https://www.yoursite.com",
    "additional_path": [
        "path/to/include",
        "another/path"
    ],
    "exclude_path": [
        "path/to/exclude",
        "another/excluded/path"
    ]
}
```

**Configuration Options:**
- **`site_url`** (required): The base URL for your site. Used as the base for all sitemap entries.
- **`additional_path`** (optional): Array of paths to include in the sitemap that don't exist as HTML files (e.g., dynamically generated pages).
- **`exclude_path`** (optional): Array of path patterns to exclude from the sitemap. Paths matching these patterns will be skipped.

## Usage

### Generate Sitemap
Run the following command to generate the sitemap:

```bash
npm run generate-sitemap
```

### Automatic Generation
The sitemap is automatically generated after running the production build:

```bash
npm run prod
```

This triggers the `postprod` script which calls `generate-sitemap`.

## Sitemap Structure

### URL Priority Levels
- **Homepage (`/`)**: Priority 1.0, changefreq: daily
- **First-level pages**: Priority 0.8
- **Nested pages**: Priority 0.5

### XML Format
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" 
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://www.yoursite.com/</loc>
    <lastmod>2025-12-23T06:23:22.420Z</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  ...
</urlset>
```

## Generated File
- **Location**: `public/sitemap.xml`
- **Access URL**: `https://www.yoursite.com/sitemap.xml`

## Features
- ✅ Automatic discovery of all HTML pages
- ✅ Dynamic lastmod timestamps based on file modification times
- ✅ SEO-optimized priority levels
- ✅ Excludes technical/asset directories
- ✅ Custom path exclusion rules via `exclude_path` configuration
- ✅ Support for additional paths via `additional_path` configuration
- ✅ Validates against sitemap.org schema

## Path Exclusion
The script supports excluding specific paths from the sitemap through the `exclude_path` configuration in `public_data.json`. This is useful for:
- Excluding draft or work-in-progress pages
- Removing deprecated sections
- Hiding temporary or staging content

**Example:**
```json
{
    "site_url": "https://www.yoursite.com",
    "exclude_path": [
        "draft",
        "temp/pages",
        "archive"
    ]
}
```

Paths are matched using partial string matching, so `"draft"` will exclude both `/draft/` and any path containing `draft`.

## Additional Paths
You can include paths in the sitemap that don't correspond to physical HTML files using the `additional_path` configuration. This is useful for:
- Dynamically generated pages
- API routes that render content
- Future pages planned for deployment

**Example:**
```json
{
    "site_url": "https://www.yoursite.com",
    "additional_path": [
        "api/resource",
        "dynamic/page"
    ]
}
```

These paths will be added to the sitemap with the current timestamp as their `lastmod` date and a default priority of 0.5.

## Troubleshooting

### Sitemap not generating
- Ensure `public_data.json` exists in the root folder
- Verify the `site_url` is correctly configured
- Check that `public/` directory contains `index.html` files

### Wrong URLs in sitemap
- Update the `site_url` in `public_data.json` to match your production domain
- Regenerate the sitemap with `npm run generate-sitemap`

### Missing pages
- Ensure pages have an `index.html` file
- Check that the directory is not in the exclusion list in `generate-sitemap.js`
- Verify the path is not being excluded by the `exclude_path` configuration in `public_data.json`
- For non-existing paths, add them to the `additional_path` array in `public_data.json`

### Pages appearing that shouldn't
- Add the path pattern to the `exclude_path` array in `public_data.json`
- Regenerate the sitemap with `npm run generate-sitemap`

## Deployment
After generating the sitemap:
1. Verify the sitemap at `public/sitemap.xml`
2. Deploy the site with the updated sitemap
3. Submit the sitemap URL to search engines (Google Search Console, Bing Webmaster Tools)

## Maintenance
- The sitemap is automatically regenerated on each production build
- Update `public_data.json` if the domain changes
- Review excluded directories in `generate-sitemap.js` if new technical folders are added

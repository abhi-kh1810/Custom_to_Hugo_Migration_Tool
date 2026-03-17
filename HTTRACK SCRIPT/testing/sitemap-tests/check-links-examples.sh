#!/bin/bash

# Link Checker - Usage Examples

echo "======================================"
echo "Link Checker - Usage Examples"
echo "======================================"
echo ""

# Example 1: Check local sitemap (default)
echo "1. Check local files (default):"
echo "   npm run check-links"
echo "   OR"
echo "   node check-links.js ./public/sitemap.xml"
echo ""

# Example 2: Check remote sitemap
echo "2. Check remote website:"
echo "   node check-links.js https://hjerteamyloidosedk-preview.pfizerstatic.io/sitemap.xml"
echo "   OR"
echo "   npm run check-links:remote"
echo ""

# Example 3: Check with custom output
echo "3. Check with custom output file:"
echo "   node check-links.js https://example.com/sitemap.xml ./my-report.txt"
echo ""

# Example 4: Check with date-stamped report
echo "4. Check with date-stamped report:"
echo "   node check-links.js ./public/sitemap.xml ./reports/links-\$(date +%Y%m%d).txt"
echo ""

# Example 5: Check multiple sites
echo "5. Check multiple sites:"
echo "   node check-links.js https://site1.com/sitemap.xml ./site1-report.txt"
echo "   node check-links.js https://site2.com/sitemap.xml ./site2-report.txt"
echo ""

# Example 6: Using with npm arguments
echo "6. Pass arguments via npm:"
echo "   npm run check-links -- https://example.com/sitemap.xml"
echo "   npm run check-links -- ./public/sitemap.xml ./custom-report.txt"
echo ""

echo "======================================"
echo "Run any example by copying the command"
echo "======================================"

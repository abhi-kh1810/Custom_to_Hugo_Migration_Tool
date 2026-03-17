# Sitemap URL Comparison Tool

This script compares URLs between production and preview environments by fetching sitemaps from both, checking HTTP status codes for each URL, and outputting the results to a CSV file.

## Features

- Reads domain names and subscription names from an input CSV
- Downloads sitemaps from production (`https://{domain}/sitemap.xml?context=all`)
- Downloads sitemaps from preview (`https://{subscription_name}-preview.pfizerstatic.io/sitemap.xml`)
- Extracts all URLs from both sitemaps
- Checks HTTP status codes for each URL
- Matches URLs by path between production and preview
- Identifies URLs that exist in preview but not in production (and vice versa)
- Outputs comprehensive comparison to CSV file

## Usage

```bash
./compare_sitemap_urls.sh <input_csv> <output_csv>
```

### Example

```bash
./compare_sitemap_urls.sh sample_input.csv comparison_results.csv
```

## Input CSV Format

The input CSV should have the following format:

```csv
domain,subscription_name
www.akromegali.se,pfelakromegalise
www.dejadefumarconayuda.es,pfeldejadefumarconayudaes
www.diccionariomieloma.es,pfeldicionariomielomes
```

- **domain**: The production domain name (without `https://`)
- **subscription_name**: The subscription name used to construct the preview URL

## Output CSV Format

The output CSV will have the following format:

```csv
production_url,production_status,preview_url,preview_status
https://www.akromegali.se/front-page,200,https://pfelakromegalise-preview.pfizerstatic.io/front-page,200
https://www.akromegali.se/about,200,https://pfelakromegalise-preview.pfizerstatic.io/about,404
https://www.akromegali.se/contact,404,https://pfelakromegalise-preview.pfizerstatic.io/contact,200
NOT_FOUND,N/A,https://pfelakromegalise-preview.pfizerstatic.io/new-page,200
```

### Column Descriptions

- **production_url**: The URL from the production sitemap
- **production_status**: HTTP status code for the production URL (e.g., 200, 404, 500)
- **preview_url**: The matching URL from the preview sitemap
- **preview_status**: HTTP status code for the preview URL

### Special Values

- `NOT_FOUND`: Indicates the URL doesn't exist in the other environment
- `N/A`: Status code is not applicable (when URL doesn't exist)
- `000`: Connection timeout or network error

## Status Code Reference

Common HTTP status codes you might see:

- **200**: Success - page exists and loads correctly
- **301**: Permanent redirect
- **302**: Temporary redirect
- **404**: Not found - page doesn't exist
- **500**: Internal server error
- **503**: Service unavailable
- **000**: Connection timeout or network error

## Requirements

- `bash` (version 4.0+)
- `curl` (for downloading sitemaps and checking URLs)
- `grep` (for XML parsing)
- `sed` (for text processing)

## Example Workflow

1. Create your input CSV file with domain and subscription names:

```bash
cat > my_sites.csv << EOF
domain,subscription_name
www.example.com,pfelexamplecom
www.another-site.com,pfelanthersitecom
EOF
```

2. Run the comparison script:

```bash
./compare_sitemap_urls.sh my_sites.csv results.csv
```

3. Review the results:

```bash
# View the first 20 lines
head -n 20 results.csv

# Count URLs by status code
cut -d',' -f2,4 results.csv | sort | uniq -c

# Find URLs that work in production but fail in preview
awk -F',' '$2=="200" && $4!="200" {print}' results.csv

# Find URLs that only exist in preview
grep "^NOT_FOUND," results.csv
```

## Performance Notes

- The script processes URLs sequentially to avoid overwhelming servers
- Each URL check has a 10-second timeout
- Sitemap downloads have a 30-second timeout
- Progress is shown every 10 URLs processed

## Troubleshooting

### "Failed to download sitemap"

- Verify the domain name is correct
- Check if the sitemap exists at the specified URL
- Ensure you have internet connectivity

### "000" status codes

- The URL took too long to respond (>10 seconds)
- Network connectivity issues
- Server is overloaded or blocking requests

### Script runs very slowly

- The script checks each URL individually for accuracy
- Large sitemaps (>1000 URLs) will take significant time
- Consider running during off-peak hours


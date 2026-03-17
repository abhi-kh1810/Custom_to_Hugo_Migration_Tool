# Site Migration Workflow Guide



Complete step-by-step guide for migrating and validating Drupal sites.



---



## Prerequisites



### HTTrack Installation



**macOS:**

```bash

# Using Homebrew

brew install httrack

```



**Linux (Ubuntu/Debian):**

```bash

sudo apt-get update

sudo apt-get install httrack

```



**Linux (CentOS/RHEL):**

```bash

sudo yum install httrack

```



**Windows:**

1. Download from: https://www.httrack.com/page/2/en/index.html
2. Run the installer (WinHTTrack)
3. Follow installation wizard



**Verify Installation:**

```bash

httrack --version

```



### Other Requirements



- Python 3 installed

- Node.js installed (for testing tools)

- Local web server capability



---



## Phase 1: Initial Migration



### Step 1: Configure Site



1. Edit `sites.txt` in the root folder

2. Add your site domain (one per line):

   ```

   www.example-site.com

   ```



### Step 2: Run Migration Script



From the **root folder**, execute:

```bash

sh run_full_migration.sh

```



This will:

- Download the site with HTTrack

- Reorganize HTML files by URL structure

- Process all images

- Fix resource paths (CSS, JS)

- Process fonts

- Generate sitemap

- Create 404 error page



### Step 3: Navigate to Migrated Site



```bash

cd public/reorg/{sitename}

```

Replace `{sitename}` with your actual site domain (e.g., `www.example-site.com`)



---



## Phase 2: Local Verification



### Step 4: Start Local Server



From the site directory:

```bash

python3 -m http.server 9090

```



Open browser: `http://localhost:9090`



### Step 5: Manual Page Verification



**Check the following:**

- [ ] Homepage loads correctly

- [ ] All navigation links work

- [ ] Images display properly

- [ ] CSS styling is intact

- [ ] JavaScript functionality works

- [ ] Multi-language pages (if applicable)

- [ ] Forms render correctly

- [ ] No console errors in browser DevTools



**Common issues to look for:**

- Missing images

- Broken internal links

- 404 errors on resources (CSS/JS)

- Unclosed HTML tags (check `<noscript>` tags)

- Mixed content warnings (HTTP/HTTPS)



---



## Phase 3: Sitemap Configuration



### Step 6: Update Sitemap for Localhost



From the **root folder**:

```bash

sh scripts/download_and_transform_sitemap.sh localhost:9090

```



### Step 7: Verify Sitemap



Check `public/reorg/{sitename}/sitemap.xml`



**Important:** If URLs use HTTPS, manually update them to HTTP:

```xml

<!-- Change from: -->

<loc>https://localhost:9090/page</loc>



<!-- To: -->

<loc>http://localhost:9090/page</loc>

```



---



## Phase 4: Response Code Validation



### Step 8: Prepare Input CSV



Create/update `input.csv` with your site details:



```csv

domain,subscription_name

www.example-site.com,local-test

```



**Note:** Use the exact domain from `sites.txt`



### Step 9: Run URL Response Check



From the **root folder**:

```bash

sh compare_sitemap_urls.sh --local 9090 input.csv result.csv

```



### Step 10: Review Results



Check `result.csv` for HTTP response codes:



**Action items:**

- ✅ **200 responses** - Pages are working correctly

- ⚠️ **302/301 redirects** - Note these for Edison.yml configuration

- ❌ **404 errors** - Investigate and fix missing pages



**For 302 redirects:** Document them for adding to `edison.yml` later



---



## Phase 5: Broken Links & Images Check



### Step 11: Run Link Checker



Navigate to the testing folder:

```bash

cd scripts/Test

```



Execute the link checker:

```bash

node check-links.js http://localhost:9090

```



### Step 12: Review and Fix Issues



The tool will generate:

- `broken-links-report.txt` - Detailed report

- `broken-links-report.csv` - Spreadsheet format



**Fix identified issues:**

- Broken internal links

- Missing images

- Invalid external links

- Incorrect resource paths



---



## Phase 6: Adobe DTM Integration



### Step 13: Apply Adobe Scripts



From the **scripts folder**:

```bash

cd scripts

```



Execute the Adobe DTM wrapper script:

```bash

sh wrap_adobe_dtm_scripts.sh www.example-site.com \

  https://assets.adobedtm.com/22baa8e94be8/ac9cdf9a9f1a/launch-55dc84f4e7f6-development.min.js \

  https://assets.adobedtm.com/22baa8e94be8/ac9cdf9a9f1a/launch-6ea59213df3f.min.js

```



**Parameters:**

1. Site domain

2. Development Adobe DTM URL

3. Production Adobe DTM URL



**What this does:**

- Wraps Adobe scripts with environment detection

- Development script loads on localhost/preview

- Production script loads on live domain



---



## Phase 7: Preview Deployment



### Step 14: Configure Edison.yml



Before deploying, update `edison.yml`:



**Add any 302 redirects found in Step 10:**

```yaml

redirects:

  - source: /old-page

    destination: /new-page

    type: 302

```



### Step 15: Update Sitemap for Preview



From the **root folder**:

```bash

sh scripts/download_and_transform_sitemap.sh {subscription-name}

```



Replace `{subscription-name}` with your Edison subscription name (e.g., `example-site-preview`)



### Step 16: Deploy to Preview



Follow your deployment process to push to:

```

{subscription-name}-preview.pfizerstatic.io

```



---



## Phase 8: Analytics Verification



### Step 17: Test Analytics Firing



Navigate to the analytics checker:

```bash

cd scripts/Test/analytics-checker

```



Execute the analytics validation:

```bash

node check-analytics.js {subscription-name}-preview.pfizerstatic.io/sitemap.xml

```



### Step 18: Verify Analytics Results



**Check that:**

- [ ] Adobe Analytics fires on all pages

- [ ] Correct Adobe DTM environment is loading

- [ ] No analytics errors in console

- [ ] Page tracking data is captured



**Manual spot-check:**

- Open preview site in browser

- Open browser DevTools > Network tab

- Filter by "analytics" or "adobedtm"

- Navigate through pages

- Confirm analytics calls are made



---



## Phase 9: 404 Page Verification



### Step 19: Test 404 Error Page



**On localhost:**

```

http://localhost:9090/nonexistent-page

```



**On preview:**

```

https://{subscription-name}-preview.pfizerstatic.io/nonexistent-page

```



**Verify:**

- [ ] 404 page displays correctly

- [ ] CSS/styling loads properly

- [ ] Images on 404 page display

- [ ] Navigation links work

- [ ] Returns to homepage link works



### Step 20: Fix 404 Page Issues (if needed)



If 404 page is broken, check:

- `errors/404.html` exists

- CSS paths are correct (`/css/...`)

- JS paths are correct (`/js/...`)

- Image paths are correct (`/images/...`)



**Regenerate 404 page if needed:**

```bash

cd scripts

sh create_404_page.sh {sitename}

```



---



## Phase 10: Final Checklist



Before going to production, verify:



### Content

- [ ] All pages accessible

- [ ] Images load correctly

- [ ] No broken links

- [ ] Forms work properly

- [ ] Multi-language navigation works



### Technical

- [ ] No 404 errors on resources

- [ ] No JavaScript console errors

- [ ] CSS styling intact

- [ ] Fonts loading correctly

- [ ] Sitemap.xml is valid



### Analytics

- [ ] Adobe DTM scripts present

- [ ] Analytics firing correctly

- [ ] Correct environment scripts loading



### SEO

- [ ] Meta tags present

- [ ] Canonical URLs correct

- [ ] Sitemap generated

- [ ] 404 page configured

- [ ] Redirects in edison.yml



### Performance

- [ ] Images optimized

- [ ] No duplicate files

- [ ] CSS/JS minified (if applicable)



---



## Troubleshooting Common Issues



### Issue: Unclosed noscript tags

**Solution:** Check if Generator meta tag removal deleted closing tag. Manually add `</noscript>` if missing.



### Issue: Missing Drupal images

**Solution:** Images with style paths may have failed. Check `failed_downloads.log` and manually download if needed.



### Issue: WebP images not downloading

**Solution:** Ensure HTTrack includes WebP support. The fix has been applied to download scripts.



### Issue: 404 page broken

**Solution:** Verify resource paths are root-relative (`/css/`, `/js/`, `/images/`). Regenerate if needed.



### Issue: Analytics not firing

**Solution:**

- Check Adobe DTM wrapper script was applied

- Verify correct environment URL

- Check browser console for script errors

- Ensure no Content Security Policy blocking scripts



### Issue: Redirects not working

**Solution:** Verify `edison.yml` syntax is correct. Redeploy after changes.



---



## Quick Reference Commands



```bash

# Full migration

sh run_full_migration.sh



# Local server

python3 -m http.server 9090



# Update sitemap for localhost

sh scripts/download_and_transform_sitemap.sh localhost:9090



# Check broken links

cd scripts/Test && node check-links.js http://localhost:9090



# Apply Adobe scripts

cd scripts && sh wrap_adobe_dtm_scripts.sh {domain} {dev-url} {prod-url}



# Update sitemap for preview

sh scripts/download_and_transform_sitemap.sh {subscription-name}



# Check analytics

cd scripts/Test/analytics-checker && node check-analytics.js {subscription-name}-preview.pfizerstatic.io/sitemap.xml



# Regenerate 404 page

cd scripts && sh create_404_page.sh {sitename}

```



---



## Support Files Generated



During migration, these files are created:



- `failed_downloads.log` - Images that failed to download

- `sitemap.xml` - Site URL map

- `errors/404.html` - Custom 404 error page

- `broken-links-report.txt` - Link validation results

- `broken-links-report.csv` - Link validation spreadsheet

- `result.csv` - HTTP response code analysis



Review these files to identify and resolve issues.



---



## Notes



- Always test locally before deploying to preview

- Document any manual fixes applied

- Keep `edison.yml` updated with redirects

- Backup original site files before migration

- Test on multiple browsers if possible

- Verify mobile responsiveness



---



**Last Updated:** Based on migration scripts with WebP support and Drupal image style fixes applied.




# 🚀 Quick Start: Migration Integration

## What Changed?

✅ The `ednlt-drupaldemomigrations` folder is now inside the `server/` directory  
✅ All migration scripts are fully integrated with the server API  
✅ You can now use `./migrate_site.sh {url}` and all supporting scripts through the API  

## Before & After

### Before
```
Create_Hugo_Site/
├── ednlt-drupaldemomigrations/  ❌ Separate folder
│   └── migrate_site.sh
├── server/
└── client/
```

### After
```
Create_Hugo_Site/
├── server/
│   ├── ednlt-drupaldemomigrations/  ✅ Moved here
│   │   ├── migrate_site.sh
│   │   ├── public/                  (downloaded sites)
│   │   └── scripts/                 (all post-processing scripts)
│   ├── services/
│   │   └── migrationService.js      ✅ NEW
│   └── routes/
│       └── migration.js             ✅ NEW
├── client/
```

## 🎯 How to Use Now

### Option 1: API (Recommended for Client Integration)

Start the server:
```bash
cd server
npm run dev
```

Make API call:
```bash
curl -X POST http://localhost:5000/api/migration/full \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Option 2: Test Script
```bash
cd server
node test-migration.js https://example.com
```

### Option 3: Direct Script (Still Works!)
```bash
cd server/ednlt-drupaldemomigrations
./migrate_site.sh https://example.com
```

## 🎁 What You Get

### New API Endpoints
- **POST** `/api/migration/full` - Complete migration with all scripts
- **POST** `/api/migration/download` - Download only
- **GET** `/api/migration/sites` - List downloaded sites
- **POST** `/api/migration/process-images/:siteName` - Process images
- **POST** `/api/migration/fix-paths/:siteName` - Fix resource paths
- **POST** `/api/migration/create-404/:siteName` - Create 404 page
- **DELETE** `/api/migration/sites/:siteName` - Delete a site

### New Files Created
- `server/services/migrationService.js` - Migration service
- `server/routes/migration.js` - API endpoints
- `server/test-migration.js` - Testing script
- `server/test-api.sh` - API testing script
- `server/MIGRATION_INTEGRATION.md` - Full documentation
- `server/MIGRATION_SUMMARY.md` - Summary of changes

## 🔍 Example: Full Migration

```javascript
// From your client or Node.js code
const response = await fetch('http://localhost:5000/api/migration/full', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com',
    options: {
      includeImageProcessing: true,
      includeResourcePathFixing: true,
      include404Page: true
    }
  })
});

const result = await response.json();
console.log(result);
// {
//   "success": true,
//   "siteName": "example.com",
//   "downloadedSiteDir": "/path/to/server/ednlt-drupaldemomigrations/public/example.com"
// }
```

## ✅ All Scripts Are Now Used

When you call `/api/migration/full`, it automatically runs:
1. ✅ `migrate_site.sh` - Downloads the website
2. ✅ `scripts/process_images_complete.sh` - Processes all images
3. ✅ `scripts/fix_all_resource_paths.sh` - Fixes CSS, JS, image paths
4. ✅ `scripts/create_404_page.sh` - Creates custom 404 page

**No more manual script execution needed!**

## 📦 Downloaded Sites Location

All downloaded sites are stored in:
```
server/ednlt-drupaldemomigrations/public/{hostname}/
```

Example:
```
server/ednlt-drupaldemomigrations/public/example.com/
```

## 🧪 Quick Test

```bash
# Test the migration
cd server
node test-migration.js https://example.com --download-only

# Or test via API (after starting server with npm run dev)
./test-api.sh
```

## 📚 Full Documentation

- **MIGRATION_INTEGRATION.md** - Complete API documentation
- **MIGRATION_SUMMARY.md** - Detailed summary of all changes

## ⚠️ Requirements

Make sure HTTrack is installed:
```bash
# macOS
brew install httrack

# Ubuntu/Debian
sudo apt-get install httrack
```

## 🎉 That's It!

The migration is now fully integrated! You can:
- ✅ Use the API from your client
- ✅ Run the test script
- ✅ Still use the original scripts directly if needed
- ✅ All supporting scripts are automatically used

---

**Need Help?** Check the full documentation in `MIGRATION_INTEGRATION.md`

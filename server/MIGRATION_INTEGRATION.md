# Migration Integration Guide

## Overview

The `ednlt-drupaldemomigrations` folder has been integrated into the server to provide comprehensive website migration and download capabilities. This integration enables you to:

- Download entire websites using HTTrack
- Process images and fix resource paths
- Create 404 pages
- Convert downloaded sites to Hugo format
- Perform full migrations with all post-processing steps

## Directory Structure

```
server/
├── ednlt-drupaldemomigrations/
│   ├── migrate_site.sh              # Main migration script
│   ├── migrate.sh                   # Alternative migration script
│   ├── run_full_migration.sh        # Full migration runner
│   ├── public/                      # Downloaded sites stored here
│   └── scripts/                     # Post-processing scripts
│       ├── create_404_page.sh
│       ├── download_all_images.sh
│       ├── fix_all_resource_paths.sh
│       ├── process_images_complete.sh
│       └── ...
├── services/
│   ├── migrationService.js          # Main migration service
│   └── htmlToHugoConverter.js       # HTML to Hugo converter
└── routes/
    ├── migration.js                 # Migration API endpoints
    └── convert.js                   # Conversion API endpoints
```

## API Endpoints

### 1. Download Website Only
```bash
POST /api/migration/download
Content-Type: application/json

{
  "url": "https://example.com",
  "options": {
    "timeout": 1800000  // 30 minutes in milliseconds (optional)
  }
}
```

**Response:**
```json
{
  "success": true,
  "siteName": "example.com",
  "downloadedSiteDir": "/path/to/public/example.com",
  "fileCount": 150
}
```

### 2. Full Migration (Download + Post-Processing)
```bash
POST /api/migration/full
Content-Type: application/json

{
  "url": "https://example.com",
  "options": {
    "includeImageProcessing": true,     // optional, default: true
    "includeResourcePathFixing": true,  // optional, default: true
    "include404Page": true              // optional, default: true
  }
}
```

**Response:**
```json
{
  "success": true,
  "siteName": "example.com",
  "downloadedSiteDir": "/path/to/public/example.com"
}
```

### 3. List Downloaded Sites
```bash
GET /api/migration/sites
```

**Response:**
```json
{
  "success": true,
  "sites": [
    {
      "name": "example.com",
      "path": "/path/to/public/example.com",
      "createdAt": "2026-02-17T10:00:00.000Z",
      "modifiedAt": "2026-02-17T10:15:00.000Z",
      "fileCount": 150
    }
  ],
  "count": 1
}
```

### 4. Delete Downloaded Site
```bash
DELETE /api/migration/sites/example.com
```

### 5. Process Images for Existing Site
```bash
POST /api/migration/process-images/example.com
```

### 6. Fix Resource Paths for Existing Site
```bash
POST /api/migration/fix-paths/example.com
```

### 7. Create 404 Page for Existing Site
```bash
POST /api/migration/create-404/example.com
```

### 8. Full Conversion (Download + Convert to Hugo)
```bash
POST /api/convert/start
Content-Type: application/json

{
  "url": "https://example.com"
}
```

This endpoint:
1. Downloads the website using migration scripts
2. Converts HTML to Hugo markdown format
3. Builds the Hugo site
4. Creates a downloadable zip file

## Using the Migration Service Directly

The `MigrationService` class can be imported and used in your own code:

```javascript
import { MigrationService } from './services/migrationService.js';

const migrationService = new MigrationService();

// Download website only
const result = await migrationService.downloadWebsite('https://example.com', {
  timeout: 30 * 60 * 1000,
  onProgress: (message) => console.log(message)
});

// Full migration with all post-processing
const fullResult = await migrationService.fullMigration('https://example.com', {
  includeImageProcessing: true,
  includeResourcePathFixing: true,
  include404Page: true,
  onProgress: (message) => console.log(message)
});
```

## Command Line Usage

You can still use the migration scripts directly from the command line:

```bash
# Navigate to the migration directory
cd server/ednlt-drupaldemomigrations

# Run migration for a single site
./migrate_site.sh https://example.com

# The downloaded site will be in ./public/example.com/
```

## Using with Client Application

The client can call these endpoints to trigger migrations:

```javascript
// Download and migrate a website
const response = await fetch('http://localhost:5000/api/migration/full', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://example.com',
    options: {
      includeImageProcessing: true,
      includeResourcePathFixing: true,
      include404Page: true
    }
  })
});

const data = await response.json();
console.log('Migration result:', data);
```

## Testing the Migration

### Test Script
A test script is provided to quickly test the migration functionality:

```bash
cd server
node test-migration.js https://example.com
```

### Manual Testing with curl

```bash
# Full migration
curl -X POST http://localhost:5000/api/migration/full \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# List downloaded sites
curl http://localhost:5000/api/migration/sites

# Delete a site
curl -X DELETE http://localhost:5000/api/migration/sites/example.com
```

## Requirements

The following tools must be installed on your system:

- **HTTrack**: Website downloader
  ```bash
  # macOS
  brew install httrack
  
  # Ubuntu/Debian
  sudo apt-get install httrack
  ```

- **Hugo** (optional, for building sites):
  ```bash
  # macOS
  brew install hugo
  
  # Ubuntu/Debian
  sudo apt-get install hugo
  ```

- **Python 3** (for Python-based post-processing scripts):
  ```bash
  # macOS
  brew install python3
  
  # Ubuntu/Debian
  sudo apt-get install python3
  ```

## Troubleshooting

### Script Permission Errors
If you get permission denied errors, ensure all scripts are executable:
```bash
cd server/ednlt-drupaldemomigrations
chmod +x *.sh
chmod +x scripts/*.sh
chmod +x scripts/*.py
```

### HTTrack Not Found
Install HTTrack using your package manager (see Requirements section).

### Timeout Errors
For large websites, increase the timeout:
```javascript
{
  "url": "https://example.com",
  "options": {
    "timeout": 3600000  // 60 minutes
  }
}
```

### Downloaded Site Not Found
Check the `server/ednlt-drupaldemomigrations/public/` directory for downloaded sites.

## Migration Process Flow

1. **Download**: HTTrack downloads the entire website
2. **Image Processing**: Renames images, fixes paths
3. **Resource Path Fixing**: Updates all resource references
4. **404 Page**: Creates custom 404 page
5. **Hugo Conversion** (if using /api/convert): Converts HTML to Hugo markdown
6. **Build** (if using /api/convert): Builds the Hugo site
7. **Package** (if using /api/convert): Creates downloadable zip file

## Notes

- Downloaded sites are stored in `server/ednlt-drupaldemomigrations/public/{hostname}/`
- All scripts run with UTF-8 encoding (LC_ALL=en_US.UTF-8)
- HTTrack follows links up to 3 levels deep by default
- The migration service automatically handles sitemap.xml if available
- 404 pages are captured during the download process

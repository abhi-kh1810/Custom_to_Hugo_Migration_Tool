import multer from 'multer';
import path from 'path';

// Configure multer for memory storage (we'll save files ourselves)
const storage = multer.memoryStorage();

// All supported file extensions
const allowedExtensions = [
  '.html', '.htm', '.css', '.js',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp',
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  console.log(`[FILE FILTER] Checking file: ${file.originalname}, extension: ${ext}, mimetype: ${file.mimetype}`);
  if (allowedExtensions.includes(ext)) {
    console.log(`[FILE FILTER] ✓ File accepted: ${file.originalname}`);
    cb(null, true);
  } else {
    console.log(`[FILE FILTER] ✗ File rejected: ${file.originalname} (${ext})`);
    cb(new Error(`File type ${ext} is not supported`), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max per file
    files: 1000, // Up to 1000 files per request
    fieldSize: 100 * 1024 * 1024,
  },
});

export default upload;

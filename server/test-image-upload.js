import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'http://localhost:5000';

async function testImageUpload() {
  try {
    console.log('🧪 Testing Image Upload...\n');

    // Step 1: Create a test project
    console.log('1. Creating test project...');
    const createResponse = await axios.post(`${API_URL}/api/projects`, {
      name: 'Test Image Upload',
      description: 'Testing image upload functionality'
    });
    const projectId = createResponse.data.data.id;
    console.log(`✓ Project created: ${projectId}\n`);

    // Step 2: Create a simple test image (1x1 PNG)
    console.log('2. Creating test image...');
    // This is a 1x1 transparent PNG in Base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';
    const imageBuffer = Buffer.from(pngBase64, 'base64');
    const testImagePath = path.join(__dirname, 'temp', 'test-image.png');
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(testImagePath, imageBuffer);
    console.log(`✓ Test image created: ${testImagePath}\n`);

    // Step 3: Upload the image
    console.log('3. Uploading image...');
    const formData = new FormData();
    formData.append('files', fs.createReadStream(testImagePath));

    const uploadResponse = await axios.post(
      `${API_URL}/api/upload/${projectId}/images`,
      formData,
      {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    console.log('✓ Upload successful!');
    console.log('Response:', JSON.stringify(uploadResponse.data, null, 2));

    // Step 4: Verify the file was saved
    console.log('\n4. Verifying file was saved...');
    const projectPath = path.join(__dirname, 'storage', 'projects', projectId);
    const imagesPath = path.join(projectPath, 'static', 'images');
    
    if (fs.existsSync(imagesPath)) {
      const files = fs.readdirSync(imagesPath);
      console.log(`✓ Images directory exists with ${files.length} file(s):`);
      files.forEach(f => console.log(`  - ${f}`));
    } else {
      console.log('✗ Images directory not found!');
    }

    // Clean up
    console.log('\n5. Cleaning up...');
    fs.unlinkSync(testImagePath);
    console.log('✓ Test complete!\n');

  } catch (error) {
    console.error('❌ Test failed!');
    console.error('Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
    process.exit(1);
  }
}

testImageUpload();

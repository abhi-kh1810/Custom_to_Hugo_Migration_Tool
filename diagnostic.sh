#!/bin/bash

echo "🔍 Hugo Site Builder - Quick Diagnostic Check"
echo "=============================================="
echo ""

# Check if server is running
echo "1. Checking if server is running on port 5000..."
if lsof -ti:5000 > /dev/null 2>&1; then
  PID=$(lsof -ti:5000)
  echo "   ✓ Server is running (PID: $PID)"
else
  echo "   ✗ Server is NOT running"
  echo "   → Start it with: cd server && npm start"
fi
echo ""

# Check if client is running
echo "2. Checking if client is running on port 3000..."
if lsof -ti:3000 > /dev/null 2>&1; then
  PID=$(lsof -ti:3000)
  echo "   ✓ Client is running (PID: $PID)"
else
  echo "   ✗ Client is NOT running"
  echo "   → Start it with: cd client && npm run dev"
fi
echo ""

# Check storage directory
echo "3. Checking storage directory..."
if [ -d "server/storage/projects" ]; then
  COUNT=$(find server/storage/projects -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  echo "   ✓ Storage directory exists"
  echo "   → Found $COUNT project(s)"
else
  echo "   ✗ Storage directory not found"
  echo "   → It will be created automatically when server starts"
fi
echo ""

# Check dependencies
echo "4. Checking server dependencies..."
cd server
if [ -d "node_modules" ]; then
  echo "   ✓ Server dependencies installed"
  
  # Check specific packages
  if [ -d "node_modules/multer" ]; then
    echo "   ✓ multer installed"
  else
    echo "   ✗ multer NOT installed"
  fi
  
  if [ -d "node_modules/express" ]; then
    echo "   ✓ express installed"
  else
    echo "   ✗ express NOT installed"
  fi
else
  echo "   ✗ Server dependencies NOT installed"
  echo "   → Run: cd server && npm install"
fi
cd ..
echo ""

echo "5. Checking client dependencies..."
cd client
if [ -d "node_modules" ]; then
  echo "   ✓ Client dependencies installed"
else
  echo "   ✗ Client dependencies NOT installed"
  echo "   → Run: cd client && npm install"
fi
cd ..
echo ""

# Test server endpoint
echo "6. Testing server health endpoint..."
if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
  RESPONSE=$(curl -s http://localhost:5000/api/health)
  echo "   ✓ Server is responding"
  echo "   → Response: $RESPONSE"
else
  echo "   ✗ Server is not responding"
  echo "   → Make sure server is running on port 5000"
fi
echo ""

echo "=============================================="
echo "Diagnostic check complete!"
echo ""
echo "If you're experiencing image upload issues:"
echo "1. Make sure both server and client are running"
echo "2. Restart the server to enable new logging"
echo "3. Check IMAGE_UPLOAD_TROUBLESHOOTING.md for detailed steps"
echo ""

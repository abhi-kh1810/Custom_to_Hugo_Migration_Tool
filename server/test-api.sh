#!/bin/bash

# API Testing Script for Migration Endpoints
# This script provides examples for testing all migration API endpoints

BASE_URL="http://localhost:5001"
TEST_URL="https://example.com"

echo "=================================="
echo "Migration API Testing Script"
echo "=================================="
echo ""
echo "Make sure the server is running:"
echo "  cd server && npm run dev"
echo ""
echo "Press Enter to continue..."
read

echo ""
echo "1️⃣  Testing: POST /api/migration/download"
echo "   Description: Download website only"
echo ""
echo "Request:"
echo "curl -X POST $BASE_URL/api/migration/download \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"url\": \"$TEST_URL\"}'"
echo ""
echo "Press Enter to execute..."
read

curl -X POST "$BASE_URL/api/migration/download" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$TEST_URL\"}" | jq '.'

echo ""
echo "Press Enter to continue to next test..."
read

echo ""
echo "2️⃣  Testing: POST /api/migration/full"
echo "   Description: Full migration with post-processing"
echo ""
echo "Request:"
echo "curl -X POST $BASE_URL/api/migration/full \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"url\": \"$TEST_URL\", \"options\": {}}'"
echo ""
echo "Press Enter to execute..."
read

curl -X POST "$BASE_URL/api/migration/full" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$TEST_URL\", \"options\": {}}" | jq '.'

echo ""
echo "Press Enter to continue to next test..."
read

echo ""
echo "3️⃣  Testing: GET /api/migration/sites"
echo "   Description: List all downloaded sites"
echo ""
echo "Request:"
echo "curl $BASE_URL/api/migration/sites"
echo ""
echo "Press Enter to execute..."
read

curl "$BASE_URL/api/migration/sites" | jq '.'

echo ""
echo "Press Enter to continue to next test..."
read

echo ""
echo "4️⃣  Testing: POST /api/convert/start"
echo "   Description: Full conversion (download + convert to Hugo)"
echo ""
echo "Request:"
echo "curl -X POST $BASE_URL/api/convert/start \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"url\": \"$TEST_URL\"}'"
echo ""
echo "Press Enter to execute..."
read

RESPONSE=$(curl -s -X POST "$BASE_URL/api/convert/start" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$TEST_URL\"}")

echo "$RESPONSE" | jq '.'

# Extract jobId for status check
JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId')

if [ "$JOB_ID" != "null" ] && [ -n "$JOB_ID" ]; then
  echo ""
  echo "Job started with ID: $JOB_ID"
  echo ""
  echo "Press Enter to check status..."
  read

  echo ""
  echo "5️⃣  Testing: GET /api/convert/status/$JOB_ID"
  echo "   Description: Check conversion job status"
  echo ""
  echo "Request:"
  echo "curl $BASE_URL/api/convert/status/$JOB_ID"
  echo ""

  curl "$BASE_URL/api/convert/status/$JOB_ID" | jq '.'
fi

echo ""
echo "=================================="
echo "Testing Complete!"
echo "=================================="
echo ""
echo "Additional endpoints to test manually:"
echo ""
echo "• Process images for a site:"
echo "  curl -X POST $BASE_URL/api/migration/process-images/{siteName}"
echo ""
echo "• Fix resource paths:"
echo "  curl -X POST $BASE_URL/api/migration/fix-paths/{siteName}"
echo ""
echo "• Create 404 page:"
echo "  curl -X POST $BASE_URL/api/migration/create-404/{siteName}"
echo ""
echo "• Delete a site:"
echo "  curl -X DELETE $BASE_URL/api/migration/sites/{siteName}"
echo ""

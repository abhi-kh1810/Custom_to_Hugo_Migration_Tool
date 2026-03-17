#!/bin/bash

echo "🚀 Starting Hugo Site Builder..."
echo ""

# Check if node_modules exist
if [ ! -d "server/node_modules" ]; then
    echo "📦 Installing server dependencies..."
    cd server && npm install && cd ..
fi

if [ ! -d "client/node_modules" ]; then
    echo "📦 Installing client dependencies..."
    cd client && npm install && cd ..
fi

# Check if .env exists
if [ ! -f "client/.env" ]; then
    echo "📝 Creating client .env file..."
    cp client/.env.example client/.env
fi

# Check if HTTrack is installed
if ! command -v httrack &> /dev/null; then
    echo ""
    echo "⚠️  WARNING: HTTrack is not installed!"
    echo "Please install HTTrack to use URL conversion feature:"
    echo "  macOS:    brew install httrack"
    echo "  Ubuntu:   sudo apt-get install httrack"
    echo ""
fi

# Check if Hugo is installed (optional)
if ! command -v hugo &> /dev/null; then
    echo ""
    echo "ℹ️  INFO: Hugo is not installed (optional)"
    echo "Hugo sites will be created without the build step."
    echo "You can build them manually later."
    echo "  To install: brew install hugo"
    echo ""
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Starting servers..."
echo ""
echo "Backend:  http://localhost:5000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start backend in background
cd server
npm run dev &
SERVER_PID=$!
cd ..

# Wait for server to start
sleep 3

# Start frontend
cd client
npm run dev &
CLIENT_PID=$!
cd ..

# Wait for both processes
wait $SERVER_PID $CLIENT_PID

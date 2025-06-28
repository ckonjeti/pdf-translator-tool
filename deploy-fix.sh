#!/bin/bash

echo "🔧 Applying Railway build fixes..."

# Remove any problematic files
rm -f Dockerfile*
rm -f .dockerignore

# Ensure package-lock.json files exist
if [ ! -f "package-lock.json" ]; then
    echo "📦 Generating package-lock.json..."
    npm install --package-lock-only --legacy-peer-deps
fi

if [ ! -f "client/package-lock.json" ]; then
    echo "📦 Generating client package-lock.json..."
    cd client && npm install --package-lock-only && cd ..
fi

# Check required files
if [ ! -f "client/public/index.html" ]; then
    echo "❌ Missing client/public/index.html"
    exit 1
fi

if [ ! -f "server.railway.simple.js" ]; then
    echo "❌ Missing server.railway.simple.js"
    exit 1
fi

echo "✅ All fixes applied!"
echo "🚀 Ready to commit and deploy to Railway"
echo ""
echo "Next steps:"
echo "1. git add ."
echo "2. git commit -m 'Fix Railway build issues'"
echo "3. git push origin main"
echo "4. Deploy in Railway dashboard"
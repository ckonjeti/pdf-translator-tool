#!/bin/bash

# Railway Deployment Script for Sanskrit Translator
# This script helps prepare the project for Railway deployment

echo "🚀 Preparing Sanskrit Translator for Railway deployment..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Backup original files
echo "📦 Backing up original files..."
cp package.json package.json.backup
cp server.js server.js.backup

# Use Railway-optimized files
echo "🔧 Using Railway-optimized files..."
cp package.json.railway package.json
cp server.railway.js server.js

# Check if files exist
if [ ! -f "package.json.railway" ]; then
    echo "❌ Error: package.json.railway not found. Please ensure all Railway files are present."
    exit 1
fi

if [ ! -f "server.railway.js" ]; then
    echo "❌ Error: server.railway.js not found. Please ensure all Railway files are present."
    exit 1
fi

# Clean up any existing node_modules
echo "🧹 Cleaning up node_modules..."
rm -rf node_modules
rm -rf client/node_modules

# Install dependencies locally to test
echo "📥 Installing dependencies locally to test..."
npm install --legacy-peer-deps --no-optional

if [ $? -eq 0 ]; then
    echo "✅ Server dependencies installed successfully"
else
    echo "❌ Server dependencies failed to install"
    echo "🔄 Restoring original files..."
    cp package.json.backup package.json
    cp server.js.backup server.js
    exit 1
fi

# Install client dependencies
echo "📥 Installing client dependencies..."
cd client
npm install --legacy-peer-deps --no-optional

if [ $? -eq 0 ]; then
    echo "✅ Client dependencies installed successfully"
else
    echo "❌ Client dependencies failed to install"
    cd ..
    echo "🔄 Restoring original files..."
    cp package.json.backup package.json
    cp server.js.backup server.js
    exit 1
fi

cd ..

# Test build
echo "🔨 Testing build process..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully"
else
    echo "❌ Build failed"
    echo "🔄 Restoring original files..."
    cp package.json.backup package.json
    cp server.js.backup server.js
    exit 1
fi

# Commit changes
echo "📝 Committing changes..."
git add .
git commit -m "Prepare for Railway deployment - use optimized files"

if [ $? -eq 0 ]; then
    echo "✅ Changes committed successfully"
else
    echo "❌ Failed to commit changes"
    echo "🔄 Restoring original files..."
    cp package.json.backup package.json
    cp server.js.backup server.js
    exit 1
fi

# Push to GitHub
echo "🚀 Pushing to GitHub..."
git push

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub"
    echo ""
    echo "🎉 Railway deployment preparation completed!"
    echo ""
    echo "Next steps:"
    echo "1. Go to Railway dashboard: https://railway.app"
    echo "2. Create new project from GitHub repo"
    echo "3. Add environment variables:"
    echo "   - OPENAI_API_KEY=your_api_key_here"
    echo "   - NODE_ENV=production"
    echo "   - PORT=5000"
    echo "4. Deploy and test your app"
    echo ""
    echo "To restore original files later:"
    echo "cp package.json.backup package.json"
    echo "cp server.js.backup server.js"
else
    echo "❌ Failed to push to GitHub"
    echo "🔄 Restoring original files..."
    cp package.json.backup package.json
    cp server.js.backup server.js
    exit 1
fi 
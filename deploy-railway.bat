@echo off
REM Railway Deployment Script for Sanskrit Translator
REM This script helps prepare the project for Railway deployment

echo 🚀 Preparing Sanskrit Translator for Railway deployment...

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Error: package.json not found. Please run this script from the project root.
    pause
    exit /b 1
)

REM Backup original files
echo 📦 Backing up original files...
copy package.json package.json.backup
copy server.js server.js.backup

REM Use Railway-optimized files
echo 🔧 Using Railway-optimized files...
copy package.json.railway package.json
copy server.railway.js server.js

REM Check if files exist
if not exist "package.json.railway" (
    echo ❌ Error: package.json.railway not found. Please ensure all Railway files are present.
    pause
    exit /b 1
)

if not exist "server.railway.js" (
    echo ❌ Error: server.railway.js not found. Please ensure all Railway files are present.
    pause
    exit /b 1
)

REM Clean up any existing node_modules
echo 🧹 Cleaning up node_modules...
if exist "node_modules" rmdir /s /q node_modules
if exist "client\node_modules" rmdir /s /q client\node_modules

REM Install dependencies locally to test
echo 📥 Installing dependencies locally to test...
npm install --legacy-peer-deps --no-optional

if %errorlevel% equ 0 (
    echo ✅ Server dependencies installed successfully
) else (
    echo ❌ Server dependencies failed to install
    echo 🔄 Restoring original files...
    copy package.json.backup package.json
    copy server.js.backup server.js
    pause
    exit /b 1
)

REM Install client dependencies
echo 📥 Installing client dependencies...
cd client
npm install --legacy-peer-deps --no-optional

if %errorlevel% equ 0 (
    echo ✅ Client dependencies installed successfully
) else (
    echo ❌ Client dependencies failed to install
    cd ..
    echo 🔄 Restoring original files...
    copy package.json.backup package.json
    copy server.js.backup server.js
    pause
    exit /b 1
)

cd ..

REM Test build
echo 🔨 Testing build process...
npm run build

if %errorlevel% equ 0 (
    echo ✅ Build completed successfully
) else (
    echo ❌ Build failed
    echo 🔄 Restoring original files...
    copy package.json.backup package.json
    copy server.js.backup server.js
    pause
    exit /b 1
)

REM Commit changes
echo 📝 Committing changes...
git add .
git commit -m "Prepare for Railway deployment - use optimized files"

if %errorlevel% equ 0 (
    echo ✅ Changes committed successfully
) else (
    echo ❌ Failed to commit changes
    echo 🔄 Restoring original files...
    copy package.json.backup package.json
    copy server.js.backup server.js
    pause
    exit /b 1
)

REM Push to GitHub
echo 🚀 Pushing to GitHub...
git push

if %errorlevel% equ 0 (
    echo ✅ Successfully pushed to GitHub
    echo.
    echo 🎉 Railway deployment preparation completed!
    echo.
    echo Next steps:
    echo 1. Go to Railway dashboard: https://railway.app
    echo 2. Create new project from GitHub repo
    echo 3. Add environment variables:
    echo    - OPENAI_API_KEY=your_api_key_here
    echo    - NODE_ENV=production
    echo    - PORT=5000
    echo 4. Deploy and test your app
    echo.
    echo To restore original files later:
    echo copy package.json.backup package.json
    echo copy server.js.backup server.js
) else (
    echo ❌ Failed to push to GitHub
    echo 🔄 Restoring original files...
    copy package.json.backup package.json
    copy server.js.backup server.js
    pause
    exit /b 1
)

pause 
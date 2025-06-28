#!/bin/bash

# Simple Railway Deployment Script for Sanskrit Translator
# This script helps prepare and deploy your app to Railway

echo "🚀 Railway Deployment Script for Sanskrit Translator"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in the project root directory"
    echo "Please run this script from the sanskrit-translator directory"
    exit 1
fi

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git branch -M main
fi

# Check for required files
echo "🔍 Checking required files for Railway deployment..."

required_files=("Dockerfile.railway" "railway.json" "package.json.railway" ".railwayignore")
missing_files=()

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -ne 0 ]; then
    echo "❌ Missing required files:"
    printf ' - %s\n' "${missing_files[@]}"
    echo "Please ensure all required files are present"
    exit 1
fi

echo "✅ All required files present"

# Check for OpenAI API key in .env
if [ -f ".env" ]; then
    if grep -q "OPENAI_API_KEY=your_openai_api_key_here" .env; then
        echo "⚠️  Warning: Please update your OpenAI API key in .env file"
        echo "   You'll also need to set it in Railway's environment variables"
    else
        echo "✅ OpenAI API key appears to be configured in .env"
    fi
else
    echo "⚠️  Warning: .env file not found"
    echo "   Make sure to set OPENAI_API_KEY in Railway's environment variables"
fi

# Prepare for deployment
echo "📋 Preparing for deployment..."

# Add all files to git
git add .

# Check if there are any changes to commit
if git diff --cached --quiet; then
    echo "ℹ️  No changes to commit"
else
    echo "💾 Committing changes..."
    git commit -m "Prepare for Railway deployment - $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo ""
echo "🎉 Ready for Railway deployment!"
echo ""
echo "Next steps:"
echo "1. Push to GitHub: git push origin main"
echo "2. Go to https://railway.app"
echo "3. Create new project from GitHub repo"
echo "4. Set environment variables (see RAILWAY_DEPLOYMENT_GUIDE.md)"
echo "5. Deploy and configure your domain"
echo ""
echo "📖 For detailed instructions, see: RAILWAY_DEPLOYMENT_GUIDE.md"
echo ""

# Offer to push to GitHub
read -p "Do you want to push to GitHub now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Pushing to GitHub..."
    
    # Check if remote origin exists
    if git remote get-url origin > /dev/null 2>&1; then
        git push origin main
        echo "✅ Pushed to GitHub successfully!"
    else
        echo "❌ No GitHub remote found"
        echo "Please add your GitHub repository as origin:"
        echo "git remote add origin https://github.com/yourusername/your-repo.git"
        echo "git push -u origin main"
    fi
else
    echo "👍 Remember to push to GitHub when ready:"
    echo "git push origin main"
fi

echo ""
echo "🌟 Your app will be available at translatorassistant.com after deployment!"
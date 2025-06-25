# Railway Deployment Guide for Sanskrit Translator

## Step-by-Step Railway Deployment

### Prerequisites
- GitHub account with your code repository
- OpenAI API key
- GoDaddy domain: translatorassistant.com

### Step 1: Prepare Your Repository
1. Make sure all changes are committed to GitHub
2. Your repository should contain:
   - `server.js` (main server file)
   - `package.json` (with all dependencies)
   - `client/` folder (React frontend)
   - `.env` file should be in `.gitignore`

### Step 2: Deploy to Railway
1. **Go to Railway**: Visit [railway.app](https://railway.app)
2. **Sign Up**: Use your GitHub account to sign up
3. **Create New Project**: Click "New Project"
4. **Connect Repository**: Select "Deploy from GitHub repo"
5. **Select Repository**: Choose your sanskrit-translator repository
6. **Wait for Detection**: Railway will automatically detect it's a Node.js app

### Step 3: Configure Environment Variables
1. In Railway dashboard, go to your project
2. Click the "Variables" tab
3. Add these environment variables:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   NODE_ENV=production
   PORT=5000
   ```

### Step 4: Deploy
1. Railway will automatically start building your app
2. The build process will:
   - Install server dependencies
   - Install client dependencies  
   - Build the React app
   - Start the server
3. Wait for deployment to complete (2-5 minutes)

### Step 5: Test Your App
1. Once deployed, Railway will provide a URL like: `https://your-app-name.railway.app`
2. Click the URL to test your app
3. Try uploading a PDF to make sure everything works

### Step 6: Connect Your Domain
1. In Railway dashboard, go to "Settings" → "Domains"
2. Click "Add Domain"
3. Enter: `translatorassistant.com`
4. Railway will provide DNS records to add to GoDaddy

### Step 7: Update GoDaddy DNS
1. Log into your GoDaddy account
2. Go to DNS Management for `translatorassistant.com`
3. Add the CNAME record provided by Railway:
   - **Type**: CNAME
   - **Name**: @
   - **Value**: `your-app-name.railway.app` (from Railway)
4. Save the changes
5. Wait 24-48 hours for DNS propagation

## Troubleshooting npm Install Issues

### If you encounter npm install failures:

#### Option 1: Use Railway-Optimized Files
1. **Rename files for Railway deployment**:
   ```bash
   # Backup original files
   cp package.json package.json.backup
   cp server.js server.js.backup
   
   # Use Railway-optimized versions
   cp package.json.railway package.json
   cp server.railway.js server.js
   ```

2. **Commit and push the changes**:
   ```bash
   git add .
   git commit -m "Use Railway-optimized files"
   git push
   ```

3. **Redeploy on Railway** - it will automatically rebuild

#### Option 2: Use Docker Deployment
1. **Use the Railway Dockerfile**:
   ```bash
   # Railway will automatically use Dockerfile.railway
   # Or manually specify in Railway settings
   ```

2. **The Dockerfile.railway includes**:
   - Simplified dependencies (no canvas)
   - Better error handling
   - Fallback mechanisms

#### Option 3: Manual Fix
If the above doesn't work, try these steps:

1. **Clear npm cache in Railway**:
   - Go to Railway dashboard
   - Click on your deployment
   - Go to "Settings" → "Build & Deploy"
   - Add build command: `npm cache clean --force && npm install --legacy-peer-deps --no-optional`

2. **Update package.json scripts**:
   ```json
   {
     "scripts": {
       "postinstall": "cd client && npm install --legacy-peer-deps --no-optional && npm run build"
     }
   }
   ```

## Common npm Install Issues and Solutions

### Issue: Canvas dependency fails
**Solution**: Use `package.json.railway` which removes the canvas dependency

### Issue: Peer dependency conflicts
**Solution**: Use `--legacy-peer-deps` flag (already included in Dockerfile.railway)

### Issue: Network timeouts during npm install
**Solution**: 
1. Use `--no-optional` flag to skip optional dependencies
2. Clear npm cache before install
3. Use a different npm registry if needed

### Issue: Memory issues during build
**Solution**: 
1. Railway automatically handles this
2. If needed, upgrade to Railway Pro for more resources

## Alternative Deployment Approaches

### Option 1: Render.com
1. Similar to Railway but with different build process
2. Often more reliable for Node.js apps
3. Free tier available

### Option 2: Heroku
1. More established platform
2. Requires credit card for verification
3. $7/month minimum

### Option 3: Vercel
1. Great for React apps
2. Free tier available
3. May need API routes for backend

## Cost
- **Railway Free Tier**: $5/month for basic usage
- **Railway Pro**: $20/month for more resources
- **Render Free**: Available with limitations
- **Heroku**: $7/month minimum

## Support
- Railway has excellent documentation and support
- You can check deployment logs in real-time
- Railway handles all the complex build processes automatically

## Next Steps After Deployment
1. Test all functionality (PDF upload, OCR, translation)
2. Monitor your OpenAI API usage
3. Set up monitoring if needed
4. Consider setting up automatic deployments from GitHub

## Files Created for Railway Deployment
- `package.json.railway` - Simplified dependencies without canvas
- `server.railway.js` - Server with canvas fallback handling
- `Dockerfile.railway` - Optimized Docker build for Railway
- Updated `Dockerfile` - Better error handling and npm configuration

## Health Check
After deployment, test the health endpoint:
```
https://your-app.railway.app/api/health
```

This will show:
- Server status
- Canvas availability
- OpenAI API key configuration
- Timestamp

## Troubleshooting

### If Build Fails:
1. **Check Railway Logs**: Click on your deployment to see detailed logs
2. **Common Issues**:
   - Missing environment variables
   - Invalid OpenAI API key
   - Network issues during npm install

### If App Doesn't Work:
1. **Check Environment Variables**: Make sure OPENAI_API_KEY is set
2. **Check OpenAI Credits**: Ensure your API key has credits
3. **Check Railway Logs**: Look for error messages

### If Domain Doesn't Work:
1. **Wait for DNS**: DNS changes can take 24-48 hours
2. **Check DNS Records**: Verify the CNAME record is correct
3. **Test with Railway URL**: Make sure the app works with the Railway URL first 
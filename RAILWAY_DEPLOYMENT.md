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

## Cost
- **Railway Free Tier**: $5/month for basic usage
- **Railway Pro**: $20/month for more resources

## Support
- Railway has excellent documentation and support
- You can check deployment logs in real-time
- Railway handles all the complex build processes automatically

## Next Steps After Deployment
1. Test all functionality (PDF upload, OCR, translation)
2. Monitor your OpenAI API usage
3. Set up monitoring if needed
4. Consider setting up automatic deployments from GitHub 
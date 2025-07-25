# Deployment Guide for Sanskrit Translator

## Quick Deploy to Railway (Recommended)

### 1. Prepare Your Repository
- Ensure all changes are committed to GitHub
- Make sure your `.env` file is in `.gitignore` (it should be)
- The build scripts have been fixed to handle client dependencies properly

### 2. Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Sign up with your GitHub account
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway will automatically detect it's a Node.js app

### 3. Configure Environment Variables
In Railway dashboard:
1. Go to your project
2. Click "Variables" tab
3. Add:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `NODE_ENV`: `production`

### 4. Deploy
1. Railway will automatically build and deploy your app
2. Wait for deployment to complete (usually 2-5 minutes)
3. The build process will:
   - Install server dependencies
   - Install client dependencies
   - Build the React app
   - Start the server

### 5. Connect Your Domain
1. In Railway dashboard, go to "Settings" → "Domains"
2. Click "Add Domain"
3. Enter: `translatorassistant.com`
4. Railway will provide DNS records

### 6. Update GoDaddy DNS
1. Log into GoDaddy
2. Go to DNS Management for `translatorassistant.com`
3. Add the CNAME record provided by Railway
4. Wait 24-48 hours for DNS propagation

## Alternative: Deploy to Render

1. Go to [render.com](https://render.com)
2. Connect GitHub repository
3. Create new "Web Service"
4. Configure:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
5. Add environment variables
6. Deploy and connect domain

## Docker Deployment (Advanced)

### Option 1: Alpine Linux (Faster, Smaller)
```bash
docker build -t sanskrit-translator .
docker run -p 5000:5000 sanskrit-translator
```

### Option 2: Ubuntu Base (More Compatible)
If Alpine build fails, use the Ubuntu version:
```bash
docker build -f Dockerfile.ubuntu -t sanskrit-translator .
docker run -p 5000:5000 sanskrit-translator
```

### Option 3: Simple Build (Troubleshooting)
If you're having npm install issues, try the simplified version:
```bash
# Copy the simple package.json
cp package.json.simple package.json
# Build with simple Dockerfile
docker build -f Dockerfile.simple -t sanskrit-translator .
docker run -p 5000:5000 sanskrit-translator
```

### Docker Build Issues Fixed:
- ✅ **Native dependencies**: Added system packages for canvas, tesseract.js
- ✅ **Build tools**: Included python3, make, g++, etc.
- ✅ **Font support**: Added font packages for OCR
- ✅ **Legacy peer deps**: Added `--legacy-peer-deps` flag for compatibility
- ✅ **Verbose output**: Added `--verbose` flag to see detailed npm install logs

## Troubleshooting

### Build Issues Fixed:
- ✅ **react-scripts not found**: Fixed by ensuring client dependencies are installed before build
- ✅ **Build order**: Server dependencies → Client dependencies → React build → Start server
- ✅ **Native module compilation**: Added system dependencies for canvas and tesseract.js
- ✅ **Docker build failures**: Created alternative Dockerfile with Ubuntu base
- ✅ **npm install failures**: Added verbose logging and error handling

### Common Issues:
- **Build fails**: Check that all dependencies are in `package.json`
- **App crashes**: Check environment variables are set correctly
- **Domain not working**: Wait for DNS propagation (can take 24-48 hours)
- **Docker build fails**: Try the Ubuntu Dockerfile (`Dockerfile.ubuntu`)
- **npm install fails**: Try the simple version without canvas (`package.json.simple`)

### Environment Variables Required:
- `OPENAI_API_KEY`: Your OpenAI API key
- `NODE_ENV`: Set to `production`

### File Structure Check:
```
├── server.js (main server file)
├── package.json (with all dependencies)
├── package.json.simple (without canvas for testing)
├── Procfile (for deployment)
├── Dockerfile (Alpine Linux version)
├── Dockerfile.ubuntu (Ubuntu version)
├── Dockerfile.simple (minimal dependencies)
├── .dockerignore (optimizes Docker build)
├── client/ (React frontend)
│   ├── package.json
│   ├── src/
│   └── public/
└── .gitignore (excludes node_modules, .env, etc.)
```

## Cost Estimation
- **Railway**: Free tier available, then $5-20/month
- **Render**: Free tier available, then $7-25/month
- **Heroku**: $7-25/month (no free tier anymore)

## Support
If you encounter issues:
1. Check the deployment platform's logs
2. Ensure all environment variables are set
3. Verify your OpenAI API key is valid and has credits
4. The build process now properly handles client dependencies
5. For Docker issues, try the Ubuntu Dockerfile
6. For npm install issues, try the simple package.json without canvas 
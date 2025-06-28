# 🔧 Railway Build Issue Fixes

## Problem: npm ci Error

If you're getting this error during Railway deployment:
```
npm error The `npm ci` command can only install with an existing package-lock.json
```

## ✅ Solution Options

I've created multiple Dockerfile options to fix this issue. Try them in this order:

### Option 1: Basic Dockerfile (Recommended)
**File**: `Dockerfile.railway.basic`
- Uses your existing `package.json` and `package-lock.json`
- Simplest approach, most likely to work

**To use**:
1. The `railway.json` is already configured for this
2. Just deploy - it should work now

### Option 2: Simple Dockerfile
**File**: `Dockerfile.railway.simple`
- Uses `package.json.railway` but with `npm install` instead of `npm ci`
- Single-stage build

**To use**:
1. Update `railway.json`:
```json
{
  "build": {
    "dockerfilePath": "Dockerfile.railway.simple"
  }
}
```

### Option 3: Multi-stage Dockerfile (Fixed)
**File**: `Dockerfile.railway`
- The original multi-stage build, now fixed
- Most optimized but more complex

**To use**:
1. Update `railway.json`:
```json
{
  "build": {
    "dockerfilePath": "Dockerfile.railway"
  }
}
```

## 🚀 Quick Fix Steps

1. **Current setup** uses `Dockerfile.railway.basic` (simplest)
2. **Push your changes**:
   ```bash
   git add .
   git commit -m "Fix Railway build issues"
   git push origin main
   ```
3. **Redeploy** in Railway dashboard

## 🔍 If Still Having Issues

### Memory Issues (Exit Code 137)
If you see "exit code 137" or memory issues:

1. **Reduce dependencies during build**:
   ```dockerfile
   # Add this to your Dockerfile
   ENV NODE_OPTIONS="--max-old-space-size=2048"
   ```

2. **Use Railway Pro plan** for more build resources

### Canvas Installation Issues
If canvas compilation fails:

1. **Check build logs** for specific error
2. **Try without canvas** temporarily:
   ```bash
   # Remove canvas from package.json
   # Deploy without PDF processing
   # Add canvas back later
   ```

### Alternative: Railway's Node.js Builder
Instead of Dockerfile, try Railway's automatic Node.js detection:

1. **Delete** `railway.json` file
2. **Let Railway auto-detect** your Node.js app
3. **Set environment variables** as before

## 🆘 Emergency Deployment Options

### Option A: Simplified Package.json
1. Temporarily remove problematic dependencies
2. Deploy basic version
3. Add features back gradually

### Option B: Different Deployment Platform
If Railway continues to fail:
- **Vercel**: Good for frontend + serverless functions
- **Render**: Similar to Railway, sometimes more stable
- **DigitalOcean App Platform**: Alternative container platform

## 📊 Current Configuration

**Active Dockerfile**: `Dockerfile.railway.basic`
**Why**: Simplest approach using existing package files
**Fallbacks**: Two other Dockerfile options available

## 🔄 Testing Locally

Before pushing changes, test the Docker build locally:

```bash
# Test the basic Dockerfile
docker build -f Dockerfile.railway.basic -t sanskrit-test .

# Test running the container
docker run -p 5000:5000 -e OPENAI_API_KEY=your_key sanskrit-test

# Check if it works
curl http://localhost:5000
```

## 📞 Support

If none of these options work:
1. **Check Railway Status**: [status.railway.app](https://status.railway.app)
2. **Railway Discord**: Join their community for help
3. **Try Alternative**: Use `Dockerfile.railway.simple` or `.basic`

---

**Current Status**: ✅ Fixed with `Dockerfile.railway.basic`
**Next Step**: Commit and push your changes to trigger a new build
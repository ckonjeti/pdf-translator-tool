# 🚀 Render Deployment Guide for Sanskrit Translator

This guide will walk you through deploying your Sanskrit Translator application to Render and configuring your custom domain `translatorassistant.com`.

## 📋 Prerequisites

Before starting, ensure you have:

- [ ] Render account (sign up at [render.com](https://render.com))
- [ ] GitHub account with this repository
- [ ] Valid OpenAI API key
- [ ] Domain `translatorassistant.com` (managed through your domain registrar)

## 🎯 Step 1: Prepare Your Repository

### 1.1 Verify Required Files

Make sure these files are in your repository:
- ✅ `package.json` (updated for Render)
- ✅ `server.js` (main server file)
- ✅ `render.yaml` (Render configuration)
- ✅ `Dockerfile` (optimized for Render)
- ✅ `.renderignore` (build optimization)
- ✅ `.env.render.example` (environment variables template)
- ✅ `client/` directory with React app

### 1.2 Push Your Code to GitHub

```bash
# Commit all changes
git add .
git commit -m "Configure for Render deployment"
git push origin main
```

## 🚀 Step 2: Deploy to Render

### 2.1 Create New Web Service

1. Go to [render.com](https://render.com) and sign in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account if not already connected
4. Select your Sanskrit Translator repository
5. Configure the service:

#### Basic Settings:
- **Name**: `sanskrit-translator`
- **Region**: `Oregon (US West)` (recommended)
- **Branch**: `main`
- **Runtime**: `Node`

#### Build & Deploy Settings:
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Auto-Deploy**: `Yes`

### 2.2 Configure Environment Variables

In the **Environment** tab, add these variables:

#### Required Variables:
```
OPENAI_API_KEY=your_actual_openai_api_key_here
NODE_ENV=production
```

#### Optional Performance Variables:
```
NODE_OPTIONS=--max-old-space-size=2048
NPM_CONFIG_PRODUCTION=false
```

### 2.3 Advanced Settings

In the **Settings** tab:
- **Instance Type**: `Starter ($7/month)` or `Standard ($25/month)` for better performance
- **Health Check Path**: `/`
- **Auto Deploy**: `Enabled`

### 2.4 Initial Deployment

1. Click **"Create Web Service"**
2. Render will start building your application
3. Monitor the build logs in the **Logs** tab
4. First build may take 10-15 minutes due to canvas compilation
5. Once complete, you'll get a Render URL like `https://sanskrit-translator.onrender.com`

## 🌐 Step 3: Configure Custom Domain

### 3.1 Add Domain in Render

1. Go to **Settings** → **Custom Domains**
2. Click **"Add Custom Domain"**
3. Enter `translatorassistant.com`
4. Click **"Add Domain"**
5. Repeat for `www.translatorassistant.com`

### 3.2 Configure DNS Records

Render will provide you with specific values. Add these records in your domain registrar:

#### For Root Domain (translatorassistant.com):
```
Type: CNAME
Name: @
Value: sanskrit-translator.onrender.com
TTL: 300
```

#### For WWW Subdomain:
```
Type: CNAME
Name: www
Value: sanskrit-translator.onrender.com
TTL: 300
```

### 3.3 SSL Certificate

- Render automatically provisions SSL certificates via Let's Encrypt
- Wait 5-15 minutes for certificate provisioning
- Verify: `https://translatorassistant.com`

## ⚙️ Step 4: Production Optimization

### 4.1 Performance Monitoring

1. **Enable Metrics** in Render dashboard
2. **Monitor Resource Usage**:
   - CPU and memory usage
   - Response times
   - Error rates

### 4.2 Scaling Options

- **Starter Plan**: $7/month, good for moderate traffic
- **Standard Plan**: $25/month, better performance
- **Pro Plan**: $85/month, high performance

### 4.3 Database Setup (For Future User Login)

When ready to add user authentication:

1. Create **PostgreSQL Database** in Render
2. Add connection string to environment variables
3. Update server code to use database

## 🔧 Step 5: Troubleshooting

### Common Issues and Solutions

#### Build Fails with Canvas Errors
- **Issue**: Canvas compilation fails
- **Solution**: Render has better canvas support than Railway
- **Alternative**: Use the Dockerfile for consistent builds

#### Environment Variables Not Working
- **Issue**: OpenAI API key not found
- **Solution**: 
  1. Double-check variable name: `OPENAI_API_KEY`
  2. Redeploy after adding variables
  3. Check logs for specific error messages

#### File Upload Issues
- **Issue**: Uploads folder not writable
- **Solution**: Render's filesystem is ephemeral
- **Recommendation**: Files are cleaned up automatically

#### Performance Issues
- **Monitor**: Use Render's metrics dashboard
- **Upgrade**: Consider Standard plan for better performance
- **Optimize**: Check OpenAI API usage and costs

### Debug Commands

Test your deployment:

```bash
# Check domain status
nslookup translatorassistant.com

# Test HTTPS
curl -I https://translatorassistant.com

# Test API endpoint
curl https://translatorassistant.com/api/health
```

## 📊 Step 6: Monitoring and Maintenance

### 6.1 Regular Monitoring

- **Render Dashboard**: Check metrics and logs weekly
- **OpenAI Usage**: Monitor API usage and costs
- **Domain Health**: Ensure SSL certificate stays valid
- **Application Performance**: Review response times

### 6.2 Updates and Deployment

```bash
# To deploy updates:
git add .
git commit -m "Update: description of changes"
git push origin main
# Render automatically deploys from main branch
```

### 6.3 Backup and Recovery

- **Code**: Backed up in GitHub
- **Environment Variables**: Document securely
- **Uploaded Files**: Temporary (cleaned automatically)

## 💰 Cost Estimation

### Render Pricing
- **Starter Plan**: $7/month
  - 0.5 CPU, 512MB RAM
  - Good for moderate usage
- **Standard Plan**: $25/month
  - 1 CPU, 2GB RAM
  - Better for higher traffic

### OpenAI API Costs
- **GPT-4**: ~$0.03 per 1K tokens
- **Typical translation**: 100-500 tokens per page
- **Estimated cost**: $3-15 per 100 pages translated

## 🎉 Success Checklist

Once deployed, verify these work:

- [ ] `https://translatorassistant.com` loads properly
- [ ] PDF upload functionality works
- [ ] OCR text extraction works
- [ ] OpenAI translation works
- [ ] Word document export works
- [ ] All pages and navigation work
- [ ] SSL certificate is valid
- [ ] Mobile responsiveness

## 🆘 Support and Resources

### Render Resources
- [Render Documentation](https://render.com/docs)
- [Render Community Forum](https://community.render.com)
- [Render Status Page](https://status.render.com)

### Project Resources
- Monitor deployment logs in Render dashboard
- Test locally before deploying: `npm run dev`
- Check application health: `/api/health` endpoint

### Support Contacts
- Render Support: help@render.com
- OpenAI Support: help.openai.com

---

## 🔄 Quick Deployment Commands

For future updates:

```bash
# 1. Make your changes
# 2. Test locally
npm run dev

# 3. Commit and push
git add .
git commit -m "Your update message"
git push origin main

# 4. Render automatically deploys
# 5. Monitor deployment in Render dashboard
```

Your Sanskrit Translator will be live at `https://translatorassistant.com` in about 10-15 minutes! 🎊

## 🎯 Advantages of Render over Railway

1. **Better canvas support** - More reliable builds
2. **Stable platform** - Fewer build failures
3. **Integrated databases** - Easy PostgreSQL setup for user login
4. **Predictable pricing** - Clear cost structure
5. **Better documentation** - Extensive guides and support
6. **Auto SSL** - Automatic HTTPS certificates
7. **Health monitoring** - Built-in application monitoring
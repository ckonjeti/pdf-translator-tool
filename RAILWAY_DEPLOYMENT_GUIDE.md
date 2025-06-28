# 🚀 Railway Deployment Guide for Sanskrit Translator

This guide will walk you through deploying your Sanskrit Translator application to Railway and configuring your custom domain `translatorassistant.com`.

## 📋 Prerequisites

Before starting, ensure you have:

- [ ] Railway account (sign up at [railway.app](https://railway.app))
- [ ] GitHub account with this repository
- [ ] Valid OpenAI API key
- [ ] Domain `translatorassistant.com` (managed through your domain registrar)
- [ ] Basic understanding of environment variables

## 🎯 Step 1: Prepare Your Repository

### 1.1 Push Your Code to GitHub

```bash
# If you haven't already, initialize git and push to GitHub
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

### 1.2 Verify Required Files

Make sure these files are in your repository:
- ✅ `Dockerfile.railway` (optimized for Railway)
- ✅ `railway.json` (Railway configuration)
- ✅ `package.json.railway` (Railway-specific dependencies)
- ✅ `.railwayignore` (build optimization)
- ✅ `uploads/.gitkeep` (directory structure)

## 🚂 Step 2: Deploy to Railway

### 2.1 Create New Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your Sanskrit Translator repository
5. Railway will automatically detect the Dockerfile

### 2.2 Configure Build Settings

Railway should automatically use `Dockerfile.railway`, but verify in **Settings > Build**:
- **Build Command**: (leave empty - using Dockerfile)
- **Dockerfile Path**: `Dockerfile.railway`
- **Start Command**: (leave empty - defined in Dockerfile)

### 2.3 Environment Variables

Go to **Variables** tab and add these environment variables:

#### Required Variables:
```
OPENAI_API_KEY=your_openai_api_key_here
NODE_ENV=production
PORT=5000
```

#### Optional Variables for Better Performance:
```
NPM_CONFIG_CACHE=/tmp/.npm
NODE_OPTIONS=--max-old-space-size=4096
```

### 2.4 Initial Deployment

1. Click **"Deploy"** - Railway will start building your application
2. Monitor the build logs in the **Deployments** tab
3. First build may take 10-15 minutes due to native dependencies (canvas)
4. Once complete, you'll get a Railway URL like `https://your-app-name.railway.app`

## 🌐 Step 3: Configure Custom Domain

### 3.1 Add Domain in Railway

1. Go to **Settings > Domains** in your Railway project
2. Click **"Add Domain"**
3. Enter `translatorassistant.com`
4. Railway will provide DNS records to configure

### 3.2 Configure DNS Records

In your domain registrar's DNS management panel, add these records:

#### For Root Domain (translatorassistant.com):
```
Type: A
Name: @
Value: [Railway IP address provided]
TTL: 300
```

#### For WWW Subdomain:
```
Type: CNAME
Name: www
Value: your-app-name.railway.app
TTL: 300
```

#### Alternative: CNAME for Root (if your registrar supports it):
```
Type: CNAME
Name: @
Value: your-app-name.railway.app
TTL: 300
```

### 3.3 Verify Domain

1. Wait for DNS propagation (5-60 minutes)
2. Check domain status in Railway dashboard
3. Railway will automatically provision SSL certificate
4. Test your domain: `https://translatorassistant.com`

## ⚙️ Step 4: Production Optimization

### 4.1 Environment Configuration

Update your environment variables for production:

```
# OpenAI Configuration
OPENAI_API_KEY=your_production_api_key

# Performance Settings
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=4096

# Railway automatically sets PORT
# PORT=5000 (don't set this manually)
```

### 4.2 Monitoring Setup

1. **Enable Railway Metrics**:
   - Go to **Observability** tab
   - Enable monitoring and logging

2. **Health Checks**:
   - Railway uses the HEALTHCHECK from Dockerfile
   - Monitor in **Deployments > Health**

3. **Resource Monitoring**:
   - Watch CPU and memory usage
   - Upgrade plan if needed (Hobby: $5/month)

### 4.3 Security Considerations

1. **Environment Variables**: Never commit API keys to git
2. **CORS Configuration**: Update for production domain
3. **Rate Limiting**: Consider adding for API endpoints
4. **File Upload Limits**: Already configured in multer

## 🔧 Step 5: Troubleshooting

### Common Issues and Solutions

#### Build Fails with Canvas Errors
```bash
# In Railway logs, if you see canvas compilation errors:
# The Dockerfile.railway is optimized for this - check build logs
```

#### Application Won't Start
1. Check **Variables** tab for missing `OPENAI_API_KEY`
2. Verify **Deployments** logs for specific errors
3. Ensure all required files are committed to git

#### Domain Not Working
1. Check DNS propagation: `nslookup translatorassistant.com`
2. Verify CNAME/A records are correct
3. Wait for SSL certificate provisioning (automatic)

#### Performance Issues
1. Monitor **Observability** tab
2. Consider upgrading Railway plan
3. Check OpenAI API rate limits

### Debug Commands

```bash
# Check domain status
nslookup translatorassistant.com

# Test HTTPS
curl -I https://translatorassistant.com

# Check SSL certificate
openssl s_client -connect translatorassistant.com:443 -servername translatorassistant.com
```

## 📊 Step 6: Monitoring and Maintenance

### 6.1 Regular Monitoring

- **Railway Dashboard**: Check deployments and metrics weekly
- **OpenAI Usage**: Monitor API usage and costs
- **Domain Health**: Ensure SSL certificate stays valid
- **Application Logs**: Review for errors or unusual activity

### 6.2 Updates and Maintenance

```bash
# To deploy updates:
git add .
git commit -m "Update: description of changes"
git push origin main
# Railway automatically deploys from main branch
```

### 6.3 Backup Strategy

- **Code**: Already backed up in GitHub
- **Uploaded Files**: Consider regular cleanup of `uploads/` folder
- **Environment Variables**: Document all variables securely

## 💰 Cost Estimation

### Railway Pricing
- **Hobby Plan**: $5/month (recommended)
  - 8GB RAM, 8 vCPUs
  - 100GB network transfer
  - Custom domains included

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

### Railway Resources
- [Railway Documentation](https://docs.railway.app/)
- [Railway Discord Community](https://discord.gg/railway)
- [Railway Status Page](https://status.railway.app/)

### Project Resources
- Check `SETUP_INSTRUCTIONS.md` for local development
- Review application logs in Railway dashboard
- Test locally before deploying: `npm run dev`

### Emergency Contacts
- Railway Support: support@railway.app
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

# 4. Railway automatically deploys
# 5. Monitor deployment in Railway dashboard
```

Your Sanskrit Translator will be live at `https://translatorassistant.com` in about 15-20 minutes! 🎊
# 🌐 Domain Setup Guide: translatorassistant.com

This guide specifically covers setting up your custom domain `translatorassistant.com` with Railway.

## 📋 Prerequisites

- Domain `translatorassistant.com` purchased and accessible
- Railway project deployed and running
- Access to your domain registrar's DNS management

## 🚀 Quick Setup Steps

### 1. Add Domain in Railway

1. Go to your Railway project dashboard
2. Navigate to **Settings > Domains**
3. Click **"Add Domain"**
4. Enter: `translatorassistant.com`
5. Railway will provide DNS configuration details

### 2. Configure DNS Records

Railway will provide you with specific DNS records. Here's the general format:

#### Option A: A Records (Most Common)
```
Type: A
Name: @
Value: [Railway IP Address]
TTL: 300

Type: A  
Name: www
Value: [Railway IP Address]
TTL: 300
```

#### Option B: CNAME Records (If Supported)
```
Type: CNAME
Name: @
Value: your-project.railway.app
TTL: 300

Type: CNAME
Name: www  
Value: your-project.railway.app
TTL: 300
```

### 3. Domain Registrar Examples

#### Namecheap
1. Login to Namecheap account
2. Go to Domain List > Manage
3. Advanced DNS tab
4. Add the records provided by Railway

#### GoDaddy
1. Login to GoDaddy account
2. My Products > DNS
3. Add records section
4. Input Railway's provided values

#### Cloudflare (If using)
1. DNS tab in Cloudflare dashboard
2. Add A or CNAME records
3. Set proxy status to "DNS Only" initially

#### Google Domains
1. DNS tab in Google Domains
2. Custom resource records
3. Add Railway's DNS values

## ⏱️ DNS Propagation

- **Typical time**: 5-60 minutes
- **Maximum time**: 24-48 hours
- **Check status**: Use `nslookup translatorassistant.com`

### Checking DNS Propagation

```bash
# Check if domain resolves
nslookup translatorassistant.com

# Check from different locations
# Use online tools like: whatsmydns.net
```

## 🔒 SSL Certificate

Railway automatically provisions SSL certificates:

- **Automatic**: Railway handles Let's Encrypt certificates
- **Timeline**: Usually within 15-30 minutes after DNS propagation
- **Verification**: Check `https://translatorassistant.com`

## ✅ Verification Steps

### 1. Basic Domain Test
```bash
# Test domain resolution
ping translatorassistant.com

# Test HTTP (should redirect to HTTPS)
curl -I http://translatorassistant.com

# Test HTTPS
curl -I https://translatorassistant.com
```

### 2. Application Test
1. Visit `https://translatorassistant.com`
2. Verify the Sanskrit Translator loads
3. Test PDF upload functionality
4. Confirm all features work

### 3. SEO and Performance
- Check `https://www.translatorassistant.com` redirects properly
- Verify mobile responsiveness
- Test page load speed

## 🔧 Troubleshooting

### Common Issues

#### Domain Not Resolving
```bash
# Check current DNS
nslookup translatorassistant.com

# Expected output should show Railway's IP
```

**Solutions**:
- Wait for DNS propagation (up to 48 hours)
- Verify DNS records are correct
- Check with domain registrar support

#### SSL Certificate Issues
- **Problem**: "Not Secure" warning in browser
- **Solution**: Wait for automatic certificate provisioning
- **Timeline**: Usually 15-30 minutes after DNS works

#### Subdomain Issues
- **www not working**: Add CNAME record for `www`
- **Both should work**: `translatorassistant.com` and `www.translatorassistant.com`

### Advanced Troubleshooting

#### Check DNS Propagation Globally
Use online tools:
- [whatsmydns.net](https://whatsmydns.net)
- [dnschecker.org](https://dnschecker.org)

#### SSL Certificate Details
```bash
# Check SSL certificate info
openssl s_client -connect translatorassistant.com:443 -servername translatorassistant.com < /dev/null | openssl x509 -noout -dates
```

## 📞 Support Resources

### Railway Support
- **Dashboard**: Check domain status in Railway project
- **Documentation**: [docs.railway.app](https://docs.railway.app)
- **Support**: support@railway.app

### Domain Registrar Support
- Contact your domain registrar if DNS changes aren't taking effect
- Some registrars have specific requirements for root domain CNAME records

## 🎯 Expected Results

After successful setup:

- ✅ `https://translatorassistant.com` → Loads your Sanskrit Translator
- ✅ `https://www.translatorassistant.com` → Redirects or loads the app
- ✅ `http://translatorassistant.com` → Redirects to HTTPS
- ✅ SSL certificate shows as valid and secure
- ✅ All application functionality works

## 📊 Monitoring

### Regular Checks
- **Weekly**: Visit domain to ensure it's working
- **Monthly**: Check SSL certificate expiration (auto-renewed)
- **As needed**: Monitor Railway deployment status

### Domain Health
```bash
# Quick health check script
curl -s -o /dev/null -w "%{http_code}" https://translatorassistant.com
# Should return: 200
```

---

**🎉 Once complete, your Sanskrit Translator will be live at `https://translatorassistant.com`!**

For any domain-specific issues, consult your domain registrar's documentation or contact their support team.
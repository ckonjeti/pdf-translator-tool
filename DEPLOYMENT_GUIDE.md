# Deployment Configuration Guide

## Environment Variables for Cross-Device Image Access

To ensure images work properly across different devices and domains, set up these environment variables:

### Required Environment Variables

```bash
# Production API URL - IMPORTANT for cross-device image access
REACT_APP_API_URL=https://your-server-domain.com

# Other required variables
NODE_ENV=production
SESSION_SECRET=your-strong-secret-here
MONGODB_URI=your-mongodb-connection-string
OPENAI_API_KEY=your-openai-api-key

# SSL/HTTPS Configuration (only set to true if you have proper SSL setup)
HTTPS_ENABLED=true  # Set to false if no SSL
```

### Image Access Configuration

The `REACT_APP_API_URL` environment variable is crucial for cross-device image access:

1. **Same Domain Deployment**: If your frontend and backend are on the same domain, you can omit this variable
2. **Different Domain/Subdomain**: Set this to your backend API URL
3. **Mobile/Cross-Device Access**: This ensures images load from the correct server regardless of device

### Example Deployment Configurations

#### Option 1: Same Domain (Recommended)
```bash
# Frontend: https://myapp.com
# Backend: https://myapp.com/api
# Images: https://myapp.com/uploads

# No REACT_APP_API_URL needed - will use current origin
```

#### Option 2: Different Subdomains
```bash
# Frontend: https://app.myapp.com  
# Backend: https://api.myapp.com
# Images: https://api.myapp.com/uploads

REACT_APP_API_URL=https://api.myapp.com
```

#### Option 3: Different Domains
```bash
# Frontend: https://myapp.netlify.app
# Backend: https://myapp-api.herokuapp.com
# Images: https://myapp-api.herokuapp.com/uploads

REACT_APP_API_URL=https://myapp-api.herokuapp.com
```

## Testing Cross-Device Access

After deployment, test image access by:

1. **Same Device Different Browser**: Open in Chrome, Firefox, Safari
2. **Different Devices**: Phone, tablet, different computers
3. **Different Networks**: WiFi, mobile data, different locations
4. **Direct Image URLs**: Test accessing `/uploads/saved/[id]/page_1.png` directly

## Troubleshooting Image Issues

### Images Don't Load on Different Devices

1. **Check REACT_APP_API_URL**: Make sure it points to the correct backend server
2. **Verify CORS Headers**: Backend serves images with proper CORS headers
3. **Check Network**: Ensure the backend server is accessible from all devices
4. **Browser Console**: Look for CORS or network errors

### Images Load Locally But Not in Deployment

1. **Environment Variables**: Ensure `REACT_APP_API_URL` is set correctly
2. **Build Process**: Make sure environment variables are available during build
3. **Server Configuration**: Verify static file serving is enabled in production

### Mixed Content Errors (HTTP/HTTPS)

1. **SSL Configuration**: Ensure both frontend and backend use HTTPS in production
2. **HTTPS_ENABLED**: Set to `true` only if you have proper SSL setup
3. **Proxy Configuration**: If using a proxy, ensure SSL termination is configured

## Server Configuration

The server automatically handles:
- CORS headers for cross-origin access
- Cache headers for better performance
- Range request support for mobile devices
- Safari-compatible image loading headers

## CDN Integration (Optional)

For better performance, you can serve images through a CDN:

1. Upload images to cloud storage (AWS S3, Cloudinary, etc.)
2. Store CDN URLs in the database instead of local paths
3. Update image URL generation to use CDN URLs

This is especially beneficial for:
- Global user base
- Large image files
- High traffic applications
- Better mobile performance
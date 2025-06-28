# 🚨 Emergency: Skip Docker for Railway

If the Dockerfile continues to fail, here's how to deploy without Docker:

## Option 1: Remove Dockerfile (Recommended)

```bash
# Remove Dockerfile to let Railway auto-detect
rm Dockerfile

# Make sure package.json has correct start script
# Railway will use the main package.json automatically
```

## Option 2: Update Main Package.json

Replace the main package.json content with this lightweight version:

```json
{
  "name": "sanskrit-translator",
  "version": "1.0.0",
  "description": "Sanskrit PDF Translator",
  "main": "server.railway.simple.js",
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=8.0.0"
  },
  "scripts": {
    "start": "node server.railway.simple.js",
    "build": "cd client && npm install && npm run build",
    "install": "npm install --legacy-peer-deps --no-optional"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.5.0",
    "express": "^4.18.2",
    "fs-extra": "^11.1.1",
    "multer": "^1.4.5-lts.1",
    "openai": "^4.104.0",
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^3.11.174",
    "socket.io": "^4.8.1",
    "tesseract.js": "^4.1.1"
  }
}
```

## Quick Deploy Commands

```bash
# If using Option 1 (remove Docker)
rm Dockerfile
git add .
git commit -m "Remove Dockerfile - use Railway auto-detection"
git push origin main

# If using Option 2 (update package.json)
# Replace package.json content as shown above
git add .
git commit -m "Simplify package.json for Railway"
git push origin main
```

Railway will then:
1. Auto-detect as Node.js app
2. Run `npm install`
3. Run `npm run build` 
4. Start with `npm start`

This should work much more reliably than Docker!
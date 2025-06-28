# Railway Deployment - Minimal Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy Railway-specific package.json (without canvas)
COPY package.railway.json ./package.json
COPY client/package*.json ./client/

# Install dependencies without optional packages
RUN npm install --legacy-peer-deps --no-optional && npm cache clean --force

# Install client dependencies  
WORKDIR /app/client
RUN npm install --legacy-peer-deps --no-optional && npm cache clean --force

# Back to app root
WORKDIR /app

# Copy simplified server file
COPY server.railway.simple.js ./server.js
COPY client ./client

# Copy other necessary files
COPY *.traineddata ./

# Build the React app
RUN npm run build

# Create uploads directory
RUN mkdir -p uploads/images

# Expose port
EXPOSE $PORT

# Start the application
CMD ["node", "server.js"]
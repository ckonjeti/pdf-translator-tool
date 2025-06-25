# Use Node.js 18 as base image with build tools
FROM node:18-alpine

# Install system dependencies for canvas and other native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    jpeg-dev \
    cairo-dev \
    giflib-dev \
    pango-dev \
    libtool \
    autoconf \
    automake \
    pkgconfig \
    pixman-dev \
    build-base \
    libpng-dev \
    freetype-dev \
    fontconfig-dev \
    ttf-dejavu \
    ttf-liberation \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Clear npm cache and set npm config
RUN npm cache clean --force
RUN npm config set registry https://registry.npmjs.org/

# Install server dependencies with better error handling
RUN npm install --legacy-peer-deps --verbose --no-optional || \
    (echo "Server npm install failed, trying without canvas..." && \
     npm uninstall canvas && \
     npm install --legacy-peer-deps --verbose --no-optional)

# Install client dependencies with verbose output
RUN cd client && npm install --legacy-peer-deps --verbose --no-optional || (echo "Client npm install failed" && exit 1)

# Copy source code
COPY . .

# Build the React app
RUN npm run build

# Create uploads directory
RUN mkdir -p uploads/images

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "start"] 
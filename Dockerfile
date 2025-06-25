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

# Install dependencies with legacy peer deps flag
RUN npm install --legacy-peer-deps
RUN cd client && npm install --legacy-peer-deps

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
# Render Deployment Dockerfile
# Optimized for Render's build environment

FROM node:18-alpine

# Install system dependencies for canvas
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    libtool \
    autoconf \
    automake \
    pkgconfig \
    build-base \
    libpng-dev \
    freetype-dev \
    fontconfig-dev \
    ttf-dejavu \
    ttf-liberation

# Set working directory
WORKDIR /app

# Copy all package files first for better Docker layer caching
COPY package*.json ./
COPY client/package*.json ./client/

# Install server dependencies (production only)
RUN npm ci --only=production --legacy-peer-deps

# Copy all source code
COPY . .

# Install client dependencies and build the React app
WORKDIR /app/client
RUN npm ci --legacy-peer-deps
RUN npm run build

# Back to app root
WORKDIR /app

# Create uploads directory
RUN mkdir -p uploads/images

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port (Render uses PORT environment variable)
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 10000) + '/', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]
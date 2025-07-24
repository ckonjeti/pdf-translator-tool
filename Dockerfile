# Render Deployment Dockerfile
# Optimized for GPT-4 Vision OCR and Canvas support

FROM node:18-alpine

# Install system dependencies for canvas (PDF rendering)
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

# Copy server package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Copy all source files
COPY . .

# Install client dependencies and build React app
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
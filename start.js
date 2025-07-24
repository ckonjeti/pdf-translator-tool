// Render deployment start script
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Sanskrit Translator on Render...');
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT);
console.log('Render Service:', process.env.RENDER_SERVICE_NAME || 'local');

// Check if client build exists
const clientBuildPath = path.join(__dirname, 'client', 'build');
if (!fs.existsSync(clientBuildPath)) {
  console.warn('⚠️  Client build directory not found, but continuing...');
} else {
  console.log('✅ Client build found');
}

// Check for server file
const serverFile = './server.js';
if (!fs.existsSync(serverFile)) {
  console.error('❌ Server file not found!');
  process.exit(1);
}

// Set environment variables for Render
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || 10000; // Render default port

// Verify required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is required!');
  console.log('Please set it in your Render service environment variables.');
  process.exit(1);
}

// Create uploads directory if it doesn't exist
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  fs.mkdirSync(path.join(uploadsPath, 'images'), { recursive: true });
  console.log('✅ Created uploads directory');
}

// Start the server with error handling
try {
  console.log(`Starting server: ${serverFile}`);
  console.log('✅ All checks passed, starting application...');
  require(serverFile);
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}
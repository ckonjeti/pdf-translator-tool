// Railway deployment start script
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Sanskrit Translator for Railway...');
console.log('Node version:', process.version);
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT);

// Check if client build exists
const clientBuildPath = path.join(__dirname, 'client', 'build');
if (!fs.existsSync(clientBuildPath)) {
  console.warn('⚠️  Client build directory not found, but continuing...');
}

// Check for server files
let serverFile;
if (fs.existsSync('./server.railway.simple.js')) {
  serverFile = './server.railway.simple.js';
  console.log('✅ Using simplified Railway server');
} else if (fs.existsSync('./server.js')) {
  serverFile = './server.js';
  console.log('✅ Using main server file');
} else {
  console.error('❌ No server file found!');
  process.exit(1);
}

// Set environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || 5000;

// Start the server with error handling
try {
  console.log(`Starting server: ${serverFile}`);
  require(serverFile);
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}
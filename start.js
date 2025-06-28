// Simple start script for Railway deployment
// This allows Railway to auto-detect as a Node.js app

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Sanskrit Translator for Railway...');

// Check if we're using the simplified server
const serverFile = fs.existsSync('./server.railway.simple.js') 
  ? './server.railway.simple.js' 
  : './server.js';

console.log(`Using server file: ${serverFile}`);

// Set environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || 5000;

// Start the server
require(serverFile);
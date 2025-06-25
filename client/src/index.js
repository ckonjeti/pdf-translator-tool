import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

console.log('Starting React app...');

const root = ReactDOM.createRoot(document.getElementById('root'));

try {
  root.render(
    <App />
  );
  console.log('React app rendered successfully');
} catch (error) {
  console.error('Error rendering React app:', error);
} 
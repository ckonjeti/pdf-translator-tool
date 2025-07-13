import React from 'react';
import PdfTab from './PdfTab';
import './App.css';

function SanskritPage() {
  return (
    <div className="sanskrit-page">
      <header className="App-header">
        <h1>📚 Sanskrit PDF Translator</h1>
        <p className="subtitle">Upload a Sanskrit PDF and get accurate English translations using AI</p>
      </header>
      
      <main className="main-content">
        <PdfTab label="Sanskrit" uploadEndpoint="/api/upload?sanskrit=true" />
      </main>
    </div>
  );
}

export default SanskritPage;
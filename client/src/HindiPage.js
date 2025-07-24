import React from 'react';
import PdfTab from './PdfTab';
import './App.css';

function HindiPage() {
  return (
    <div className="hindi-page">
      <header className="App-header">
        <h1>📚 Hindi PDF Translator</h1>
        <p className="subtitle">Upload a Hindi PDF and get accurate English translations using AI</p>
      </header>
      
      <main className="main-content">
        <PdfTab label="Hindi" uploadEndpoint="/api/upload?hindi=true" />
      </main>
    </div>
  );
}

export default HindiPage;
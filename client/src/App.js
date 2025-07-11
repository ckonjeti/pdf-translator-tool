import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import io from 'socket.io-client';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import './App.css';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

function PdfTab({ label, uploadEndpoint }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [modalImagePath, setModalImagePath] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pageRanges, setPageRanges] = useState('');
  const [ocrPages, setOcrPages] = useState([]);
  const [progressUpdates, setProgressUpdates] = useState([]);
  const [editingTranslations, setEditingTranslations] = useState({});
  const [editableTranslations, setEditableTranslations] = useState({});
  const [editingTranslationOnly, setEditingTranslationOnly] = useState({});
  const [editableTranslationOnly, setEditableTranslationOnly] = useState({});
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isRedoing, setIsRedoing] = useState(null);
  const [redoError, setRedoError] = useState(null);
  const [currentProgress, setCurrentProgress] = useState({ step: 0, total: 100, message: '' });
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [ocrPrompt, setOcrPrompt] = useState('');
  const [translationPrompt, setTranslationPrompt] = useState('');
  const socketRef = useRef(null);

  // Helper function to get absolute image URL for Safari compatibility
  const getAbsoluteImageUrl = (imagePath) => {
    if (!imagePath) return '';
    
    // If already absolute URL, return as-is
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    
    // Create absolute URL with proper protocol
    const serverUrl = process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : 'http://localhost:5000';
    
    return `${serverUrl}${imagePath}`;
  };

  // Default prompts based on language
  const getDefaultOcrPrompt = (language) => {
    if (language === 'hindi') {
      return `This is an academic document containing Hindi text in Devanagari script. Please perform optical character recognition to extract all visible text accurately.

INSTRUCTIONS FOR TEXT EXTRACTION:
1. Identify and transcribe every character, word, and line visible in the document
2. Preserve the original formatting, line breaks, and spacing exactly as shown
3. Transcribe the text as-is without any translation or interpretation
4. For Devanagari script, maintain all diacritical marks and characters precisely
5. Include all numbers, punctuation marks, and symbols present
6. For multi-column layouts, transcribe from left to right, top to bottom
7. Provide only the transcribed text without additional commentary
8. If the image contains no readable text, respond with "No text detected"`;
    } else if (language === 'sanskrit') {
      return `This is an academic document containing Sanskrit text in Devanagari script. Please perform optical character recognition to extract all visible text accurately.

INSTRUCTIONS FOR TEXT EXTRACTION:
1. Identify and transcribe every character, word, and line visible in the document
2. Preserve the original formatting, line breaks, and spacing exactly as shown
3. Transcribe the text as-is without any translation or interpretation
4. For Devanagari script, maintain all diacritical marks and characters precisely
5. Include all numbers, punctuation marks, and symbols present
6. For multi-column layouts, transcribe from left to right, top to bottom
7. Provide only the transcribed text without additional commentary
8. If the image contains no readable text, respond with "No text detected"`;
    } else {
      return `This is an academic document containing text. Please perform optical character recognition to extract all visible text accurately.

INSTRUCTIONS FOR TEXT EXTRACTION:
1. Identify and transcribe every character, word, and line visible in the document
2. Preserve the original formatting, line breaks, and spacing exactly as shown
3. Transcribe the text as-is without any translation or interpretation
4. Include all numbers, punctuation marks, and symbols present
5. For multi-column layouts, transcribe from left to right, top to bottom
6. Provide only the transcribed text without additional commentary
7. If the image contains no readable text, respond with "No text detected"`;
    }
  };

  const getDefaultTranslationPrompt = (language) => {
    const sourceLang = language === 'hindi' ? 'Hindi' : language === 'sanskrit' ? 'Sanskrit' : 'the source language';
    const preserveInstructions = language === 'hindi' ? 
      `ACADEMIC TRANSLATION GUIDELINES FOR HINDI:
- Maintain Sanskrit terms in their original form when they appear
- Sanskrit vocabulary often appears in academic or literary contexts
- Preserve proper nouns, technical terms, and traditional expressions
- When uncertain about etymology, retain the original term` :
      language === 'sanskrit' ?
      `ACADEMIC TRANSLATION GUIDELINES FOR SANSKRIT:
- Maintain Hindi terms in their original form when they appear
- Modern Hindi vocabulary may appear in contemporary texts
- Preserve proper nouns, technical terms, and contemporary expressions
- When uncertain about language origin, retain the original term` : '';

    return `Please provide an academic English translation of the following ${sourceLang} text. Convert each line from Devanagari script to its English meaning while maintaining the original structure.

TRANSLATION GUIDELINES:
1. Convert each sentence to its corresponding English meaning
2. Maintain the document's original formatting and line structure
3. Preserve the exact sequence and organization of content
4. For mixed-language content, translate the ${sourceLang} portions while keeping English portions unchanged
5. Retain empty lines and whitespace as they appear
6. Provide only the translated content without additional commentary

${preserveInstructions}

Source text for translation:
{TEXT}

Translated text:`;
  };

  // Initialize WebSocket connection
  useEffect(() => {
    const serverUrl = process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000';
    socketRef.current = io(serverUrl);
    
    socketRef.current.on('connect', () => {
      console.log('Connected to WebSocket server:', socketRef.current.id);
    });

    socketRef.current.on('progress', (progressData) => {
      console.log('Progress update:', progressData);
      setCurrentProgress({
        step: progressData.step || 0,
        total: progressData.total || 100,
        message: progressData.message || ''
      });
      setProgressUpdates(prev => [...prev, progressData]);
    });

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }
    
    // Reset state
    setLoading(true);
    setError('');
    setSuccess('');
    setProgressUpdates([]);
    setOcrPages([]);
    setEditingTranslations({});
    setEditableTranslations({});
    setEditingTranslationOnly({});
    setEditableTranslationOnly({});
    setCurrentPageIndex(0);
    setTotalPages(0);
    setPageRanges('');
    setCurrentProgress({ step: 0, total: 100, message: '' });
    setSelectedFile(file);
    
    // Initialize prompts based on tab/language
    const language = label.toLowerCase();
    setOcrPrompt(getDefaultOcrPrompt(language));
    setTranslationPrompt(getDefaultTranslationPrompt(language));
    setShowPromptEditor(true);

    // Get page count from PDF
    try {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = async (e) => {
        const data = e.target.result;
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;
        setTotalPages(pdf.numPages);
        setLoading(false);
      };
    } catch (err) {
      setError('Failed to read PDF file to get page count.');
      setLoading(false);
    }
  }, [label]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    setProgressUpdates([]);
    setOcrPages([]);
    setEditingTranslations({});
    setEditableTranslations({});
    setEditingTranslationOnly({});
    setEditableTranslationOnly({});
    setCurrentProgress({ step: 0, total: 100, message: 'Starting upload...' });

    const formData = new FormData();
    formData.append('pdf', selectedFile);
    formData.append('pageRanges', pageRanges);
    formData.append('socketId', socketRef.current.id);
    formData.append('ocrPrompt', ocrPrompt);
    formData.append('translationPrompt', translationPrompt);

    try {
      const response = await axios.post(uploadEndpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data.success) {
        setSuccess(`Successfully uploaded and processed: ${response.data.originalName} (${response.data.pageCount} pages)`);
        setOcrPages(response.data.pages || []);
        setProgressUpdates(response.data.progress || []);
        
        const initialEditableTranslations = {};
        const initialEditableTranslationOnly = {};
        (response.data.pages || []).forEach((page, index) => {
          initialEditableTranslations[index] = page.translation || '';
          initialEditableTranslationOnly[index] = page.translation || '';
        });
        setEditableTranslations(initialEditableTranslations);
        setEditableTranslationOnly(initialEditableTranslationOnly);
      } else {
        setError(response.data.message || 'Processing failed.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload and process PDF');
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
      setCurrentProgress({ step: 0, total: 100, message: '' });
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setTotalPages(0);
    setPageRanges('');
    setOcrPages([]);
    setProgressUpdates([]);
    setError('');
    setSuccess('');
    setEditingTranslations({});
    setEditableTranslations({});
    setEditingTranslationOnly({});
    setEditableTranslationOnly({});
    setCurrentPageIndex(0);
    setShowPromptEditor(false);
    setOcrPrompt('');
    setTranslationPrompt('');
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  });

  const openImageInModal = (imagePath) => {
    setModalImagePath(imagePath);
  };

  const closeModal = () => {
    setModalImagePath(null);
  };

  // Rest of the component functions remain the same...
  const startEditingTranslation = (pageIndex) => {
    setEditingTranslations(prev => ({ ...prev, [pageIndex]: true }));
    setEditableTranslations(prev => ({
      ...prev,
      [pageIndex]: (prev[pageIndex] || ocrPages[pageIndex]?.text || '') + '\\n\\n' + (prev[pageIndex] || ocrPages[pageIndex]?.translation || '')
    }));
  };

  const saveTranslation = (pageIndex) => {
    setEditingTranslations(prev => ({ ...prev, [pageIndex]: false }));
    // The changes are already saved in editableTranslations state
  };

  const cancelEditingTranslation = (pageIndex) => {
    setEditingTranslations(prev => ({ ...prev, [pageIndex]: false }));
    // Reset to original values
    setEditableTranslations(prev => ({
      ...prev,
      [pageIndex]: (ocrPages[pageIndex]?.text || '') + '\\n\\n' + (ocrPages[pageIndex]?.translation || '')
    }));
  };

  const handleTranslationChange = (pageIndex, value) => {
    setEditableTranslations(prev => ({ ...prev, [pageIndex]: value }));
  };

  // Translation-only editing functions
  const startEditingTranslationOnly = (pageIndex) => {
    setEditingTranslationOnly(prev => ({ ...prev, [pageIndex]: true }));
    setEditableTranslationOnly(prev => ({
      ...prev,
      [pageIndex]: prev[pageIndex] || ocrPages[pageIndex]?.translation || ''
    }));
  };

  const saveTranslationOnly = (pageIndex) => {
    setEditingTranslationOnly(prev => ({ ...prev, [pageIndex]: false }));
  };

  const cancelEditingTranslationOnly = (pageIndex) => {
    setEditingTranslationOnly(prev => ({ ...prev, [pageIndex]: false }));
    setEditableTranslationOnly(prev => ({
      ...prev,
      [pageIndex]: ocrPages[pageIndex]?.translation || ''
    }));
  };

  const handleTranslationOnlyChange = (pageIndex, value) => {
    setEditableTranslationOnly(prev => ({ ...prev, [pageIndex]: value }));
  };

  const exportTranslations = async () => {
    try {
      console.log('Starting Word document export...');
      
      const children = [
        new Paragraph({
          children: [
            new TextRun({
              text: `${label} PDF Translations`,
              bold: true,
              size: 32,
            }),
          ],
          spacing: { after: 400 },
        })
      ];

      ocrPages.forEach((page, index) => {
        const translation = editableTranslationOnly[index] || editableTranslations[index] || page.translation || 'Translation not available.';
        const extractedText = page.text || 'No text extracted.';
        
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Page ${page.page}`,
                bold: true,
              }),
            ],
            spacing: { before: 400, after: 200 },
          })
        );

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Original Text:",
                bold: true,
              }),
            ],
            spacing: { before: 200, after: 100 },
          })
        );

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: extractedText,
              }),
            ],
            spacing: { after: 200 },
          })
        );

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Translation:",
                bold: true,
              }),
            ],
            spacing: { before: 200, after: 100 },
          })
        );

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: translation,
              }),
            ],
            spacing: { after: 300 },
          })
        );
      });

      console.log('Creating document...');
      
      const doc = new Document({
        sections: [
          {
            children: children,
          },
        ],
      });

      console.log('Generating blob...');
      const blob = await Packer.toBlob(doc);
      console.log('Saving file...');
      saveAs(blob, `${label}-translations.docx`);
      console.log('Word export completed successfully');
      
    } catch (error) {
      console.error('Error creating Word document:', error);
      // Fallback to text file
      try {
        const textContent = ocrPages.map((page, index) => {
          const translation = editableTranslationOnly[index] || editableTranslations[index] || page.translation || 'Translation not available.';
          const extractedText = page.text || 'No text extracted.';
          return `Page ${page.page}\\n\\nOriginal Text:\\n${extractedText}\\n\\nTranslation:\\n${translation}\\n\\n${'='.repeat(50)}\\n\\n`;
        }).join('');
        
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        saveAs(blob, `${label}-translations.txt`);
        console.log('Fallback text export completed');
      } catch (fallbackError) {
        console.error('Fallback export also failed:', fallbackError);
        setError('Failed to export translations');
      }
    }
  };

  const redoTranslation = async (pageIndex) => {
    if (!ocrPages[pageIndex]) return;
    
    setIsRedoing(pageIndex);
    setRedoError(null);
    
    try {
      const language = label.toLowerCase();
      const response = await axios.post('/api/redo-translation', {
        text: ocrPages[pageIndex]?.text || '',
        language: language
      });
      
      if (response.data.success) {
        setEditableTranslationOnly(prev => ({
          ...prev,
          [pageIndex]: response.data.translation
        }));
        
        setOcrPages(prev => prev.map((page, index) => 
          index === pageIndex 
            ? { ...page, translation: response.data.translation }
            : page
        ));
      } else {
        setRedoError(`Failed to redo translation for page ${pageIndex + 1}`);
      }
    } catch (error) {
      console.error('Redo translation error:', error);
      setRedoError(`Error redoing translation for page ${pageIndex + 1}: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsRedoing(null);
    }
  };

  return (
    <div className="pdf-tab">
      <div className="upload-section">
        {!selectedFile ? (
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
            <input {...getInputProps()} />
            <div className="dropzone-content">
              <div className="dropzone-icon">📄</div>
              <div className="dropzone-text">
                {isDragActive ? 'Drop the PDF here...' : 'Drag & drop a PDF file here, or click to select'}
              </div>
              <div className="dropzone-subtext">Supports PDF files up to 100MB</div>
            </div>
          </div>
        ) : (
          <div className="file-selection-container">
            <h4>Selected File: {selectedFile.name}</h4>
            {totalPages > 0 && (
              <div className="page-selection">
                <p>This document has {totalPages} pages. Enter the pages you want to translate (e.g., 1-5, 8, 11-13). Leave blank to translate all pages.</p>
                <input 
                  type="text"
                  className="page-input"
                  placeholder="e.g., 1-5, 8, 11-13"
                  value={pageRanges}
                  onChange={(e) => setPageRanges(e.target.value)}
                />
                
                {/* Prompt Editor Section */}
                {showPromptEditor && (
                  <div style={{
                    margin: '20px 0',
                    padding: '20px',
                    background: '#f8f9fa',
                    borderRadius: '10px',
                    border: '1px solid #e9ecef'
                  }}>
                    <h5 style={{ 
                      margin: '0 0 15px 0',
                      color: '#495057',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      🎯 AI Prompts Configuration
                      <button 
                        onClick={() => setShowPromptEditor(!showPromptEditor)}
                        style={{
                          background: '#6c757d',
                          color: 'white',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        {showPromptEditor ? 'Hide' : 'Show'}
                      </button>
                    </h5>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {/* OCR Prompt Editor */}
                      <div>
                        <label style={{ 
                          display: 'block', 
                          marginBottom: '8px', 
                          fontWeight: 'bold',
                          color: '#495057'
                        }}>
                          📄 Text Extraction (OCR) Prompt:
                        </label>
                        <textarea
                          value={ocrPrompt}
                          onChange={(e) => setOcrPrompt(e.target.value)}
                          style={{
                            width: '100%',
                            height: '120px',
                            padding: '10px',
                            border: '1px solid #ced4da',
                            borderRadius: '5px',
                            fontSize: '13px',
                            fontFamily: 'monospace',
                            resize: 'vertical',
                            background: 'white'
                          }}
                          placeholder="Enter the prompt for GPT-4 Vision text extraction..."
                        />
                      </div>
                      
                      {/* Translation Prompt Editor */}
                      <div>
                        <label style={{ 
                          display: 'block', 
                          marginBottom: '8px', 
                          fontWeight: 'bold',
                          color: '#495057'
                        }}>
                          📝 Translation Prompt:
                        </label>
                        <textarea
                          value={translationPrompt}
                          onChange={(e) => setTranslationPrompt(e.target.value)}
                          style={{
                            width: '100%',
                            height: '120px',
                            padding: '10px',
                            border: '1px solid #ced4da',
                            borderRadius: '5px',
                            fontSize: '13px',
                            fontFamily: 'monospace',
                            resize: 'vertical',
                            background: 'white'
                          }}
                          placeholder="Enter the prompt for GPT-4 translation..."
                        />
                        <div style={{ 
                          fontSize: '12px', 
                          color: '#6c757d', 
                          marginTop: '5px' 
                        }}>
                          Note: Use {'{TEXT}'} as a placeholder where the extracted text will be inserted.
                        </div>
                      </div>
                      
                      {/* Reset Buttons */}
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => setOcrPrompt(getDefaultOcrPrompt(label.toLowerCase()))}
                          style={{
                            background: '#17a2b8',
                            color: 'white',
                            border: 'none',
                            padding: '8px 15px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '13px'
                          }}
                        >
                          Reset OCR Prompt
                        </button>
                        <button
                          onClick={() => setTranslationPrompt(getDefaultTranslationPrompt(label.toLowerCase()))}
                          style={{
                            background: '#17a2b8',
                            color: 'white',
                            border: 'none',
                            padding: '8px 15px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '13px'
                          }}
                        >
                          Reset Translation Prompt
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="button-group">
                  <button onClick={handleUpload} className="upload-button-action">Start Translation</button>
                  <button onClick={clearSelection} className="clear-button-action">Clear Selection</button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <span>Processing PDF with OCR and translation...</span>
            <div className="progress-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(currentProgress.step / currentProgress.total) * 100}%` }}
                ></div>
              </div>
              <div className="progress-text">
                {currentProgress.message && (
                  <div className="progress-current">{currentProgress.message}</div>
                )}
                <div className="progress-percentage">
                  {Math.round((currentProgress.step / currentProgress.total) * 100)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (<div className="error"><strong>Error:</strong> {error}</div>)}
        {success && (<div className="success"><strong>Success:</strong> {success}</div>)}
        
        {/* Progress Updates */}
        {progressUpdates.length > 0 && (
          <div className="progress-container" style={{
            background: '#f8f9fa',
            padding: '15px',
            borderRadius: '8px',
            border: '1px solid #e9ecef',
            marginTop: '20px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#495057' }}>Processing Updates:</h4>
            {progressUpdates.slice(-10).map((update, index) => (
              <div key={index} style={{
                display: 'flex',
                gap: '10px',
                fontSize: '12px',
                margin: '5px 0',
                padding: '5px 0',
                borderBottom: index < progressUpdates.slice(-10).length - 1 ? '1px solid #e9ecef' : 'none'
              }}>
                <span style={{
                  color: '#6c757d',
                  fontSize: '12px',
                  minWidth: '60px',
                  fontFamily: 'monospace'
                }}>
                  {update.timestamp}
                </span>
                <span style={{
                  color: '#495057',
                  flex: 1
                }}>
                  {update.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {ocrPages.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h3>Translation Results ({ocrPages.length} pages)</h3>
            <div className="page-navigation">
              {ocrPages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentPageIndex(index)}
                  style={{
                    margin: '0 2px',
                    padding: '5px 8px',
                    background: currentPageIndex === index ? '#007bff' : '#f8f9fa',
                    color: currentPageIndex === index ? 'white' : '#495057',
                    border: '1px solid #dee2e6',
                    borderRadius: '15px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: currentPageIndex === index ? 'bold' : 'normal',
                    minWidth: '30px'
                  }}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <button onClick={exportTranslations} className="export-button">
              📄 Export Translations
            </button>
          </div>
          
          {ocrPages[currentPageIndex] && (
            <>
              <div style={{
                textAlign: 'center',
                margin: '20px 0',
                padding: '10px',
                background: '#e9ecef',
                borderRadius: '5px',
                fontWeight: 'bold',
                color: '#495057'
              }}>
                Page {ocrPages[currentPageIndex]?.page || 'Unknown'}
              </div>
              
              {/* Side by Side Layout */}
              <div style={{
                display: 'flex',
                gap: '20px',
                alignItems: 'flex-start',
                minHeight: '95vh',
                width: '100%',
                height: '95vh'
              }}>
                
                {/* Image Column - Left Side (Maximized) */}
                <div style={{
                  flex: '1.2',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  minWidth: 0,
                  height: '100%'
                }}>
                  <img 
                    src={getAbsoluteImageUrl(ocrPages[currentPageIndex]?.imagePath)}
                    alt={`Page ${ocrPages[currentPageIndex]?.page || 'Unknown'}`}
                    onClick={() => openImageInModal(ocrPages[currentPageIndex]?.imagePath)}
                    crossOrigin="anonymous"
                    loading="lazy"
                    style={{ 
                      width: '100%',
                      height: '100%',
                      maxWidth: '100%', 
                      maxHeight: '100%',
                      borderRadius: '10px',
                      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
                      objectFit: 'contain',
                      cursor: 'pointer'
                    }}
                  />
                </div>
                
                {/* Text and Translation Column - Right Side */}
                <div style={{
                  flex: '1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  minWidth: 0,
                  height: '100%'
                }}>
                  {/* Extracted Text Container */}
                  <div style={{
                    background: '#f8f9fa',
                    padding: '20px',
                    borderRadius: '10px',
                    border: '1px solid #e9ecef',
                    flex: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minHeight: '45vh',
                    height: '45vh'
                  }}>
                    <h4 style={{ 
                      margin: '0 0 15px 0', 
                      color: '#495057',
                      borderBottom: '2px solid #e9ecef',
                      paddingBottom: '8px',
                      fontSize: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>📝 Extracted Text</span>
                      <div className="edit-buttons">
                        {editingTranslations[currentPageIndex] ? (
                          <>
                            <button onClick={() => saveTranslation(currentPageIndex)} style={{
                              background: '#28a745',
                              color: 'white',
                              border: 'none',
                              padding: '5px 15px',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              marginRight: '5px'
                            }}>Save</button>
                            <button onClick={() => cancelEditingTranslation(currentPageIndex)} style={{
                              background: '#6c757d',
                              color: 'white',
                              border: 'none',
                              padding: '5px 15px',
                              borderRadius: '5px',
                              cursor: 'pointer'
                            }}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => startEditingTranslation(currentPageIndex)} style={{
                            background: '#007bff',
                            color: 'white',
                            border: 'none',
                            padding: '5px 15px',
                            borderRadius: '5px',
                            cursor: 'pointer'
                          }}>Edit</button>
                        )}
                      </div>
                    </h4>
                    <div style={{ 
                      flex: '1',
                      overflowY: 'auto',
                      padding: '15px',
                      background: 'white',
                      borderRadius: '5px',
                      border: '1px solid #dee2e6'
                    }}>
                      {editingTranslations[currentPageIndex] ? (
                        <textarea
                          value={editableTranslations[currentPageIndex] || ''}
                          onChange={(e) => handleTranslationChange(currentPageIndex, e.target.value)}
                          style={{
                            width: '100%',
                            height: '100%',
                            padding: '0',
                            border: 'none',
                            fontSize: '14px',
                            fontFamily: 'monospace',
                            resize: 'none',
                            background: 'white',
                            lineHeight: '1.5',
                            outline: 'none'
                          }}
                          placeholder="Edit extracted text and translation here..."
                        />
                      ) : (
                        <div style={{
                          fontSize: '14px',
                          lineHeight: '1.5',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {ocrPages[currentPageIndex]?.text || 'No text extracted from this page.'}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Translation Container */}
                  <div style={{
                    background: '#f8f9fa',
                    padding: '20px',
                    borderRadius: '10px',
                    border: '1px solid #e9ecef',
                    flex: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minHeight: '45vh',
                    height: '45vh'
                  }}>
                    <h4 style={{ 
                      margin: '0 0 15px 0', 
                      color: '#495057',
                      borderBottom: '2px solid #e9ecef',
                      paddingBottom: '8px',
                      fontSize: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>🔄 Translation</span>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        {editingTranslationOnly[currentPageIndex] ? (
                          <>
                            <button 
                              onClick={() => saveTranslationOnly(currentPageIndex)}
                              style={{
                                background: '#28a745',
                                color: 'white',
                                border: 'none',
                                padding: '5px 15px',
                                borderRadius: '5px',
                                cursor: 'pointer'
                              }}
                            >
                              Save
                            </button>
                            <button 
                              onClick={() => cancelEditingTranslationOnly(currentPageIndex)}
                              style={{
                                background: '#6c757d',
                                color: 'white',
                                border: 'none',
                                padding: '5px 15px',
                                borderRadius: '5px',
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => startEditingTranslationOnly(currentPageIndex)}
                              style={{
                                background: '#007bff',
                                color: 'white',
                                border: 'none',
                                padding: '5px 15px',
                                borderRadius: '5px',
                                cursor: 'pointer'
                              }}
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => redoTranslation(currentPageIndex)}
                              disabled={isRedoing === currentPageIndex}
                              style={{
                                background: isRedoing === currentPageIndex ? '#6c757d' : '#ffc107',
                                color: 'white',
                                border: 'none',
                                padding: '5px 15px',
                                borderRadius: '5px',
                                cursor: isRedoing === currentPageIndex ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {isRedoing === currentPageIndex ? 'Redoing...' : 'Redo Translation'}
                            </button>
                          </>
                        )}
                      </div>
                    </h4>
                    <div style={{ 
                      flex: '1',
                      overflowY: 'auto',
                      padding: '15px',
                      background: 'white',
                      borderRadius: '5px',
                      border: '1px solid #dee2e6'
                    }}>
                      {editingTranslationOnly[currentPageIndex] ? (
                        <textarea
                          value={editableTranslationOnly[currentPageIndex] || ''}
                          onChange={(e) => handleTranslationOnlyChange(currentPageIndex, e.target.value)}
                          style={{
                            width: '100%',
                            height: '100%',
                            padding: '0',
                            border: 'none',
                            fontSize: '14px',
                            fontFamily: 'Georgia, serif',
                            resize: 'none',
                            background: 'white',
                            lineHeight: '1.5',
                            outline: 'none'
                          }}
                          placeholder="Edit translation here..."
                        />
                      ) : (
                        <div style={{
                          fontSize: '14px',
                          lineHeight: '1.5',
                          fontFamily: 'Georgia, serif',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {editableTranslationOnly[currentPageIndex] || ocrPages[currentPageIndex]?.translation || 'No translation available.'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          {redoError && (
            <div className="error" style={{ marginTop: '10px' }}>
              <strong>Translation Error:</strong> {redoError}
            </div>
          )}
        </div>
      )}

      {/* Modal for enlarged image */}
      {modalImagePath && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>
            <img 
              src={getAbsoluteImageUrl(modalImagePath)} 
              alt="Enlarged view" 
              className="modal-image"
              crossOrigin="anonymous"
              loading="lazy"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('English');

  const tabs = [
    { name: 'English', endpoint: '/api/upload' },
    { name: 'Hindi', endpoint: '/api/upload?hindi=true' },
    { name: 'Sanskrit', endpoint: '/api/upload?sanskrit=true' }
  ];

  return (
    <div className="App">
      <header className="App-header">
        <h1>📚 Sanskrit PDF Translator</h1>
        <p className="subtitle">Upload a PDF and get accurate translations using AI</p>
      </header>

      <div className="tab-navigation">
        {tabs.map(tab => (
          <button
            key={tab.name}
            className={`tab-button ${activeTab === tab.name ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.name)}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <main className="main-content">
        {tabs.map(tab => (
          <div key={tab.name} className={`tab-content ${activeTab === tab.name ? 'active' : ''}`}>
            <PdfTab label={tab.name} uploadEndpoint={tab.endpoint} />
          </div>
        ))}
      </main>
    </div>
  );
}

export default App;
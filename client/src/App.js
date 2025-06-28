import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import io from 'socket.io-client';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
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
  const socketRef = useRef(null);

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
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !socketRef.current) return;

    setLoading(true);
    setError('');
    setSuccess('');
    setProgressUpdates([]);
    setOcrPages([]);
    setEditingTranslationOnly({});
    setEditableTranslationOnly({});
    setCurrentProgress({ step: 0, total: 100, message: 'Starting upload...' });

    const formData = new FormData();
    formData.append('pdf', selectedFile);
    formData.append('pageRanges', pageRanges);
    formData.append('socketId', socketRef.current.id);

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
      setError(err.response?.data?.error || 'Failed to upload PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRedoTranslation = async (pageIndex) => {
    const pageData = ocrPages[pageIndex];
    if (!pageData) return;

    setIsRedoing(pageIndex);
    setRedoError(null);

    try {
      const language = uploadEndpoint.includes('hindi') ? 'hindi' : 'sanskrit';
      const response = await axios.post('http://localhost:5000/api/redo-translation', {
        text: pageData.text,
        language: language,
      });

      if (response.data.success) {
        const newTranslation = response.data.translation;
        
        // Update the main pages state
        setOcrPages(prev => prev.map((page, index) => 
          index === pageIndex 
            ? { ...page, translation: newTranslation }
            : page
        ));

        // Update the editable state if it exists
        setEditableTranslations(prev => ({
          ...prev,
          [pageIndex]: newTranslation
        }));

        // Update the translation-only editable state
        setEditableTranslationOnly(prev => ({
          ...prev,
          [pageIndex]: newTranslation
        }));

      } else {
        setRedoError('Failed to get a new translation.');
      }
    } catch (err) {
      console.error("Detailed error on redo:", err);
      setRedoError(err.response?.data?.error || 'An error occurred while redoing the translation.');
    } finally {
      setIsRedoing(null);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setTotalPages(0);
    setPageRanges('');
    setError('');
    setSuccess('');
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled: !!selectedFile
  });

  const openImageInModal = (imagePath) => {
    setModalImagePath(imagePath);
  };
  
  const closeImageModal = () => {
    setModalImagePath(null);
  };

  const startEditingTranslation = (pageIndex) => {
    setEditingTranslations(prev => ({ ...prev, [pageIndex]: true }));
    
    // Create combined text for editing
    const extractedText = ocrPages[pageIndex].text || '';
    const translation = ocrPages[pageIndex].translation || '';
    
    // Split both texts into lines and filter out empty lines
    const extractedLines = extractedText.split('\n').filter(line => line.trim() !== '');
    const translationLines = translation.split('\n').filter(line => line.trim() !== '');
    
    // If we have significantly different line counts, show them separately
    if (Math.abs(extractedLines.length - translationLines.length) > 2) {
      let combinedText = '=== EXTRACTED TEXT ===\n';
      combinedText += extractedText + '\n\n';
      combinedText += '=== TRANSLATION ===\n';
      combinedText += translation;
      
      setEditableTranslations(prev => ({ ...prev, [pageIndex]: combinedText }));
      return;
    }
    
    // Combine them line by line for editing
    const maxLines = Math.max(extractedLines.length, translationLines.length);
    
    let combinedText = '';
    for (let i = 0; i < maxLines; i++) {
      const extractedLine = extractedLines[i] || '';
      const translationLine = translationLines[i] || '';
      
      if (extractedLine.trim() || translationLine.trim()) {
        combinedText += `${extractedLine}\n`;
        combinedText += `    ${translationLine}\n\n`;
      }
    }
    
    setEditableTranslations(prev => ({ 
      ...prev, 
      [pageIndex]: combinedText.trim()
    }));
  };

  const saveTranslation = (pageIndex) => {
    setEditingTranslations(prev => ({ ...prev, [pageIndex]: false }));
    
    // Parse the combined text back into separate original and translation
    const combinedText = editableTranslations[pageIndex] || '';
    
    // Check if it's in separate format
    if (combinedText.includes('=== EXTRACTED TEXT ===')) {
      const parts = combinedText.split('=== TRANSLATION ===');
      const extractedText = parts[0].replace('=== EXTRACTED TEXT ===', '').trim();
      const translation = parts[1] || '';
      
      setOcrPages(prev => prev.map((page, index) => 
        index === pageIndex 
          ? { 
              ...page, 
              text: extractedText,
              translation: translation.trim()
            }
          : page
      ));
      return;
    }
    
    // Parse line-by-line format
    const lines = combinedText.split('\n');
    
    let extractedText = '';
    let translation = '';
    let isTranslation = false;
    
    for (const line of lines) {
      if (line.trim() === '') continue;
      
      if (line.startsWith('    ')) {
        // This is a translation line (indented)
        translation += line.substring(4) + '\n';
        isTranslation = true;
      } else {
        // This is an original text line
        if (isTranslation) {
          // If we were in translation mode and now we're not, add a separator
          extractedText += '\n';
          translation += '\n';
        }
        extractedText += line + '\n';
        isTranslation = false;
      }
    }
    
    // Update the ocrPages with the new text and translation
    setOcrPages(prev => prev.map((page, index) => 
      index === pageIndex 
        ? { 
            ...page, 
            text: extractedText.trim(),
            translation: translation.trim()
          }
        : page
    ));
  };

  const cancelEditingTranslation = (pageIndex) => {
    setEditingTranslations(prev => ({ ...prev, [pageIndex]: false }));
    // Reset to original combined text
    const extractedText = ocrPages[pageIndex].text || '';
    const translation = ocrPages[currentPageIndex].translation || '';
    
    // Split both texts into lines and filter out empty lines
    const extractedLines = extractedText.split('\n').filter(line => line.trim() !== '');
    const translationLines = translation.split('\n').filter(line => line.trim() !== '');
    
    // If we have significantly different line counts, show them separately
    if (Math.abs(extractedLines.length - translationLines.length) > 2) {
      let combinedText = '=== EXTRACTED TEXT ===\n';
      combinedText += extractedText + '\n\n';
      combinedText += '=== TRANSLATION ===\n';
      combinedText += translation;
      
      setEditableTranslations(prev => ({ ...prev, [pageIndex]: combinedText }));
      return;
    }
    
    // Combine them line by line for editing
    const maxLines = Math.max(extractedLines.length, translationLines.length);
    
    let combinedText = '';
    for (let i = 0; i < maxLines; i++) {
      const extractedLine = extractedLines[i] || '';
      const translationLine = translationLines[i] || '';
      
      if (extractedLine.trim() || translationLine.trim()) {
        combinedText += `${extractedLine}\n`;
        combinedText += `    ${translationLine}\n\n`;
      }
    }
    
    setEditableTranslations(prev => ({ 
      ...prev, 
      [pageIndex]: combinedText.trim()
    }));
  };

  const handleTranslationChange = (pageIndex, value) => {
    setEditableTranslations(prev => ({ ...prev, [pageIndex]: value }));
  };

  const startEditingTranslationOnly = (pageIndex) => {
    setEditingTranslationOnly(prev => ({ ...prev, [pageIndex]: true }));
    setEditableTranslationOnly(prev => ({ 
      ...prev, 
      [pageIndex]: ocrPages[pageIndex].translation || '' 
    }));
  };

  const saveTranslationOnly = (pageIndex) => {
    setEditingTranslationOnly(prev => ({ ...prev, [pageIndex]: false }));
    
    // Update the ocrPages with the new translation
    setOcrPages(prev => prev.map((page, index) => 
      index === pageIndex 
        ? { ...page, translation: editableTranslationOnly[pageIndex] || '' }
        : page
    ));

    // Also update the combined editable translations
    setEditableTranslations(prev => ({
      ...prev,
      [pageIndex]: editableTranslationOnly[pageIndex] || ''
    }));
  };

  const cancelEditingTranslationOnly = (pageIndex) => {
    setEditingTranslationOnly(prev => ({ ...prev, [pageIndex]: false }));
    setEditableTranslationOnly(prev => ({ 
      ...prev, 
      [pageIndex]: ocrPages[pageIndex].translation || '' 
    }));
  };

  const handleTranslationOnlyChange = (pageIndex, value) => {
    setEditableTranslationOnly(prev => ({ ...prev, [pageIndex]: value }));
  };

  const exportTranslations = async () => {
    try {
      console.log('Starting Word document export...');
      
      // Create document structure for Word export
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

      // Add each page's content
      ocrPages.forEach((page, index) => {
        const translation = editableTranslationOnly[index] || editableTranslations[index] || page.translation || 'Translation not available.';
        const extractedText = page.text || 'No text extracted.';
        
        // Page header
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

        // Original text section
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

        // Add original text
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

        // Translation section
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

        // Add translation
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
      
      // Create the document
      const doc = new Document({
        sections: [
          {
            children: children,
          },
        ],
      });

      console.log('Generating blob...');
      
      // Generate and download the Word document using toBlob for browser compatibility
      const blob = await Packer.toBlob(doc);
      
      console.log('Blob created successfully...');
      
      console.log('Downloading file...');
      
      // Use file-saver for better browser compatibility
      saveAs(blob, `${label.toLowerCase()}_translations.docx`);

      console.log('Word document exported successfully!');

    } catch (error) {
      console.error('Error creating Word document:', error);
      console.error('Error details:', error.stack);
      
      // Try a different approach with better error handling
      if (error.message.includes('nodebuffer') || error.message.includes('buffer')) {
        console.log('Buffer issue detected, trying alternative export method...');
        
        try {
          // Alternative: Create a simpler RTF document which can be opened by Word
          const rtfContent = generateRTFContent();
          const rtfBlob = new Blob([rtfContent], { type: 'application/rtf' });
          saveAs(rtfBlob, `${label.toLowerCase()}_translations.rtf`);
          console.log('RTF document exported successfully!');
          return;
        } catch (rtfError) {
          console.error('RTF export also failed:', rtfError);
        }
      }
      
      alert('Error creating Word document: ' + error.message + '. Falling back to text file.');
      
      // Fallback to text export if Word export fails
      const content = ocrPages.map((page, index) => {
        const translation = editableTranslationOnly[index] || editableTranslations[index] || page.translation || 'Translation not available.';
        return `Page ${page.page}:\n\nOriginal Text:\n${page.text || 'No text extracted.'}\n\nTranslation:\n${translation}\n\n${'='.repeat(50)}\n\n`;
      }).join('');
      
      const textBlob = new Blob([content], { type: 'text/plain' });
      saveAs(textBlob, `${label.toLowerCase()}_translations.txt`);
    }
    
    // Helper function to generate RTF content
    function generateRTFContent() {
      let rtf = '{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;} {\\f1 Arial;}}';
      rtf += '\\f0\\fs28\\b ' + label + ' PDF Translations\\b0\\fs24\\par\\par';
      
      ocrPages.forEach((page, index) => {
        const translation = editableTranslationOnly[index] || editableTranslations[index] || page.translation || 'Translation not available.';
        const extractedText = page.text || 'No text extracted.';
        
        rtf += '\\b\\fs26 Page ' + page.page + '\\b0\\fs24\\par\\par';
        rtf += '\\b Original Text:\\b0\\par';
        rtf += extractedText.replace(/\n/g, '\\par ') + '\\par\\par';
        rtf += '\\b Translation:\\b0\\par';
        rtf += translation.replace(/\n/g, '\\par ') + '\\par\\par';
        rtf += '\\line\\line';
      });
      
      rtf += '}';
      return rtf;
    }
  };

  const goToNextPage = () => {
    if (currentPageIndex < ocrPages.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  };

  const goToPage = (pageIndex) => {
    if (pageIndex >= 0 && pageIndex < ocrPages.length) {
      setCurrentPageIndex(pageIndex);
    }
  };

  return (
    <div>
      <div className="upload-section">
        <h1>{label} PDF Viewer</h1>
        <p>Upload a PDF document to view it page by page with OCR text extraction and translation</p>
        
        {!selectedFile ? (
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dragover' : ''}`}>
            <input {...getInputProps()} />
            <div className="dropzone-icon">{isDragActive ? '📄' : '📤'}</div>
            <div className="dropzone-text">
              {isDragActive ? 'Drop the PDF here...' : 'Drag & drop a PDF file here, or click to select'}
            </div>
            <div className="dropzone-subtext">Supports PDF files up to 100MB</div>
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
            border: '1px solid #e9ecef',
            borderRadius: '10px',
            padding: '15px',
            marginTop: '20px',
            maxHeight: '300px',
            overflowY: 'auto'
          }}>
            <h4 style={{ 
              margin: '0 0 15px 0', 
              color: '#495057',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              📊 Processing Progress
            </h4>
            <div className="progress-list" style={{ fontSize: '14px' }}>
              {progressUpdates.map((update, index) => (
                <div key={index} style={{
                  padding: '8px 0',
                  borderBottom: index < progressUpdates.length - 1 ? '1px solid #e9ecef' : 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px'
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
                    flex: 1,
                    lineHeight: '1.4'
                  }}>
                    {update.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {ocrPages.length > 0 && (
        <div className="images-section">
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '20px' 
          }}>
            <h2>📖 PDF Pages with OCR Text and Translation ({ocrPages.length} total)</h2>
            <button 
              onClick={exportTranslations}
              style={{
                background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '25px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 'bold'
              }}
            >
              📄 Export to Word
            </button>
          </div>

          {/* Page Navigation */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '15px',
            marginBottom: '30px',
            padding: '15px',
            background: '#f8f9fa',
            borderRadius: '10px',
            border: '1px solid #e9ecef'
          }}>
            <button 
              onClick={goToPreviousPage}
              disabled={currentPageIndex === 0}
              style={{
                background: currentPageIndex === 0 ? '#6c757d' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '25px',
                cursor: currentPageIndex === 0 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 'bold'
              }}
            >
              ⬅️ Previous
            </button>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#495057'
            }}>
              <span>Page {currentPageIndex + 1} of {ocrPages.length}</span>
              
              {/* Page Number Buttons */}
              <div style={{
                display: 'flex',
                gap: '5px',
                flexWrap: 'wrap',
                maxWidth: '300px'
              }}>
                {ocrPages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToPage(index)}
                    style={{
                      background: currentPageIndex === index ? '#007bff' : '#e9ecef',
                      color: currentPageIndex === index ? 'white' : '#495057',
                      border: 'none',
                      padding: '5px 10px',
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
            </div>

            <button 
              onClick={goToNextPage}
              disabled={currentPageIndex === ocrPages.length - 1}
              style={{
                background: currentPageIndex === ocrPages.length - 1 ? '#6c757d' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '25px',
                cursor: currentPageIndex === ocrPages.length - 1 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 'bold'
              }}
            >
              Next ➡️
            </button>
          </div>

          {/* Current Page Display */}
          {ocrPages[currentPageIndex] && (
            <div style={{
              width: '100%',
              margin: '0 auto',
              background: 'white',
              borderRadius: '15px',
              padding: '20px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e9ecef'
            }}>
              <div style={{
                textAlign: 'center',
                marginBottom: '20px',
                padding: '10px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                borderRadius: '10px',
                fontSize: '18px',
                fontWeight: 'bold'
              }}>
                Page {ocrPages[currentPageIndex].page}
              </div>
              
              {/* Side by Side Layout */}
              <div style={{
                display: 'flex',
                gap: '30px',
                alignItems: 'flex-start',
                minHeight: '90vh',
                width: '100%'
              }}>
                
                {/* Image Column - Left Side (No Container) */}
                <div style={{
                  flex: '1',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  minWidth: 0
                }}>
                  <img 
                    src={ocrPages[currentPageIndex].imagePath}
                    alt={`Page ${ocrPages[currentPageIndex].page}`}
                    onClick={() => openImageInModal(ocrPages[currentPageIndex].imagePath)}
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '85vh',
                      borderRadius: '10px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
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
                  minWidth: 0
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
                    overflow: 'hidden'
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
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            resize: 'none',
                            background: 'white',
                            lineHeight: '1.4',
                            outline: 'none'
                          }}
                          placeholder="Edit extracted text and translation here..."
                        />
                      ) : (
                        <div style={{
                          fontSize: '12px',
                          lineHeight: '1.4',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {ocrPages[currentPageIndex].text || 'No text extracted from this page.'}
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
                    overflow: 'hidden'
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
                      <span>🌐 Translation</span>
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
                              onClick={() => handleRedoTranslation(currentPageIndex)}
                              disabled={isRedoing === currentPageIndex}
                              style={{
                                background: isRedoing === currentPageIndex ? '#6c757d' : '#ffc107',
                                color: isRedoing === currentPageIndex ? 'white' : '#212529',
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
                            fontSize: '12px',
                            fontFamily: 'Georgia, serif',
                            resize: 'none',
                            background: 'white',
                            lineHeight: '1.4',
                            outline: 'none'
                          }}
                          placeholder="Edit translation here..."
                        />
                      ) : (
                        <div style={{
                          fontSize: '12px',
                          lineHeight: '1.4',
                          fontFamily: 'Georgia, serif',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {ocrPages[currentPageIndex].translation || 'No translation available.'}
                        </div>
                      )}
                    </div>
                    {redoError && <p style={{color: '#dc3545', fontSize: '14px', marginTop: '10px'}}>{redoError}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {modalImagePath && (
        <div className="modal" onClick={closeImageModal} style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          background: 'rgba(0, 0, 0, 0.9)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000, 
          cursor: 'pointer',
          overflow: 'auto',
          padding: '20px'
        }}>
          <div style={{ 
            position: 'relative',
            maxWidth: '95%',
            maxHeight: '95%',
            background: 'white',
            borderRadius: '10px',
            padding: '20px',
            overflow: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <button style={{ 
              position: 'absolute', 
              top: '10px', 
              right: '10px', 
              background: 'white', 
              border: 'none', 
              borderRadius: '50%', 
              width: '40px', 
              height: '40px', 
              fontSize: '1.5rem', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: '#333',
              zIndex: 1001
            }} onClick={closeImageModal}>✕</button>
            
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img 
                src={modalImagePath} 
                alt="Full size page" 
                style={{ maxWidth: '100%', height: 'auto' }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('Hindi');
  return (
    <div className="App">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 30 }}>
          <button className={activeTab === 'Hindi' ? 'upload-button' : ''} style={{ marginRight: 10 }} onClick={() => setActiveTab('Hindi')}>Hindi</button>
          <button className={activeTab === 'Sanskrit' ? 'upload-button' : ''} onClick={() => setActiveTab('Sanskrit')}>Sanskrit</button>
        </div>
        {activeTab === 'Hindi' && (
          <PdfTab label="Hindi" uploadEndpoint="/api/upload?hindi=1" />
        )}
        {activeTab === 'Sanskrit' && (
          <PdfTab label="Sanskrit" uploadEndpoint="/api/upload?sanskrit=1" />
        )}
      </div>
    </div>
  );
}

export default App; 
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './TranslationDetail.css';

const TranslationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [translation, setTranslation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPage, setEditingPage] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTranslation();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTranslation = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/translations/${id}`);
      setTranslation(response.data.translation);
    } catch (error) {
      console.error('Failed to fetch translation:', error);
      if (error.response?.status === 404) {
        setError('Translation not found');
      } else {
        setError('Failed to load translation');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this translation?')) {
      return;
    }

    try {
      await axios.delete(`/api/translations/${id}`);
      navigate('/translations');
    } catch (error) {
      console.error('Failed to delete translation:', error);
      alert('Failed to delete translation');
    }
  };

  const startEditing = (pageIndex, field) => {
    const page = translation.pages[pageIndex];
    setEditingPage(pageIndex);
    setEditingField(field);
    setEditValue(field === 'original' ? page.originalText : page.translatedText);
  };

  const cancelEditing = () => {
    setEditingPage(null);
    setEditingField(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (editingPage === null || !editingField) return;

    try {
      setSaving(true);
      
      const updateData = {};
      if (editingField === 'original') {
        updateData.originalText = editValue;
      } else {
        updateData.translatedText = editValue;
      }

      const response = await axios.put(
        `/api/translations/${id}/pages/${editingPage}`,
        updateData
      );

      if (response.data.success) {
        // Update the local state
        const updatedTranslation = { ...translation };
        if (editingField === 'original') {
          updatedTranslation.pages[editingPage].originalText = editValue;
        } else {
          updatedTranslation.pages[editingPage].translatedText = editValue;
        }
        setTranslation(updatedTranslation);
        
        cancelEditing();
      }
    } catch (error) {
      console.error('Failed to save edit:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="translation-detail-container">
        <div className="loading">Loading translation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="translation-detail-container">
        <div className="error-message">
          {error}
        </div>
        <Link to="/translations" className="back-btn">
          Back to Translations
        </Link>
      </div>
    );
  }

  if (!translation) {
    return (
      <div className="translation-detail-container">
        <div className="error-message">
          Translation not found
        </div>
        <Link to="/translations" className="back-btn">
          Back to Translations
        </Link>
      </div>
    );
  }

  return (
    <div className="translation-detail-container">
      <div className="translation-header">
        <div className="header-content">
          <Link to="/translations" className="back-link">
            ← Back to Translations
          </Link>
          <h1>{translation.originalFileName}</h1>
          <div className="translation-meta">
            <span className={`language-badge ${translation.language}`}>
              {translation.language.charAt(0).toUpperCase() + translation.language.slice(1)}
            </span>
            <span className="meta-item">{translation.pageCount} pages</span>
            <span className="meta-item">{formatFileSize(translation.fileSize)}</span>
            <span className="meta-item">{formatDate(translation.createdAt)}</span>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={handleDelete} className="delete-btn">
            Delete Translation
          </button>
        </div>
      </div>

      <div className="pages-container">
        {translation.pages.map((page, index) => (
          <div key={index} className="page-section">
            <div className="page-header">
              <h2>Page {page.pageNumber}</h2>
              {page.imagePath && (
                <img 
                  src={page.imagePath} 
                  alt={`Page ${page.pageNumber}`}
                  className="page-image"
                />
              )}
            </div>
            
            <div className="text-sections">
              <div className="text-section">
                <div className="text-section-header">
                  <h3>Original Text</h3>
                  <button 
                    onClick={() => startEditing(index, 'original')}
                    className="edit-btn"
                    disabled={editingPage === index}
                  >
                    Edit OCR
                  </button>
                </div>
                {editingPage === index && editingField === 'original' ? (
                  <div className="edit-container">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="edit-textarea"
                      rows={10}
                    />
                    <div className="edit-actions">
                      <button 
                        onClick={saveEdit} 
                        className="save-btn"
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button 
                        onClick={cancelEditing} 
                        className="cancel-btn"
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-content original-text">
                    {page.originalText || 'No text extracted'}
                  </div>
                )}
              </div>
              
              <div className="text-section">
                <div className="text-section-header">
                  <h3>Translation</h3>
                  <button 
                    onClick={() => startEditing(index, 'translation')}
                    className="edit-btn"
                    disabled={editingPage === index}
                  >
                    Edit Translation
                  </button>
                </div>
                {editingPage === index && editingField === 'translation' ? (
                  <div className="edit-container">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="edit-textarea"
                      rows={10}
                    />
                    <div className="edit-actions">
                      <button 
                        onClick={saveEdit} 
                        className="save-btn"
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button 
                        onClick={cancelEditing} 
                        className="cancel-btn"
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-content translated-text">
                    {page.translatedText || 'No translation available'}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TranslationDetail;
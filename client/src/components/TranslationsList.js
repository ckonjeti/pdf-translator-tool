import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './TranslationsList.css';

const TranslationsList = () => {
  const [translations, setTranslations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({});
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchTranslations(currentPage);
  }, [currentPage]);

  const fetchTranslations = async (page = 1) => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/translations?page=${page}&limit=10`);
      setTranslations(response.data.translations);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Failed to fetch translations:', error);
      setError('Failed to load translations');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this translation?')) {
      return;
    }

    try {
      await axios.delete(`/api/translations/${id}`);
      fetchTranslations(currentPage);
    } catch (error) {
      console.error('Failed to delete translation:', error);
      alert('Failed to delete translation');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
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
      <div className="translations-list-container">
        <div className="loading">Loading translations...</div>
      </div>
    );
  }

  return (
    <div className="translations-list-container">
      <div className="translations-header">
        <h1>My Translations</h1>
        <div className="header-actions">
          <Link to="/hindi" className="new-translation-btn">
            New Translation
          </Link>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {translations.length === 0 ? (
        <div className="empty-state">
          <h2>No translations yet</h2>
          <p>Upload your first PDF to get started!</p>
          <Link to="/hindi" className="get-started-btn">
            Get Started
          </Link>
        </div>
      ) : (
        <>
          <div className="translations-grid">
            {translations.map((translation) => (
              <div key={translation._id} className="translation-card">
                <div className="translation-header">
                  <h3>{translation.originalFileName}</h3>
                  <div className="translation-actions">
                    <Link 
                      to={`/translations/${translation._id}`} 
                      className="view-btn"
                    >
                      View
                    </Link>
                    <button 
                      onClick={() => handleDelete(translation._id)}
                      className="delete-btn"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="translation-meta">
                  <div className="meta-item">
                    <span className={`language-badge ${translation.language}`}>
                      {translation.language.charAt(0).toUpperCase() + translation.language.slice(1)}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="label">Pages:</span>
                    <span>{translation.pageCount}</span>
                  </div>
                  <div className="meta-item">
                    <span className="label">Translated Pages:</span>
                    <span>{translation.pages ? translation.pages.map(p => p.pageNumber).join(', ') : 'All'}</span>
                  </div>
                  <div className="meta-item">
                    <span className="label">Size:</span>
                    <span>{formatFileSize(translation.fileSize)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="label">Created:</span>
                    <span>{formatDate(translation.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pagination.pages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage <= 1}
                className="pagination-btn"
              >
                Previous
              </button>
              
              <span className="pagination-info">
                Page {currentPage} of {pagination.pages}
              </span>
              
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, pagination.pages))}
                disabled={currentPage >= pagination.pages}
                className="pagination-btn"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TranslationsList;
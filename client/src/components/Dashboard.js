import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [translations, setTranslations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch user statistics
      const statsResponse = await axios.get('/api/translations/stats/summary');
      setStats(statsResponse.data.stats);
      
      // Fetch recent translations
      const translationsResponse = await axios.get('/api/translations?limit=5');
      setTranslations(translationsResponse.data.translations);
      
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
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

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="user-info">
          <h1>Welcome, {user?.name}!</h1>
          <p className="user-email">{user?.email}</p>
        </div>
        <div className="dashboard-actions">
          <Link to="/hindi" className="action-button primary">
            New Translation
          </Link>
          <button onClick={handleLogout} className="action-button secondary">
            Logout
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button 
            onClick={() => {
              setError('');
              fetchDashboardData();
            }}
            className="retry-button"
            style={{
              marginLeft: '10px',
              padding: '5px 10px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{stats.totalTranslations}</div>
            <div className="stat-label">Total Translations</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.totalPages}</div>
            <div className="stat-label">Pages Translated</div>
          </div>
        </div>
      )}

      <div className="dashboard-content">
        <div className="section">
          <div className="section-header">
            <h2>Recent Translations</h2>
            <Link to="/translations" className="view-all-link">
              View All
            </Link>
          </div>
          
          {translations.length === 0 ? (
            <div className="empty-state">
              <p>No translations yet. <Link to="/hindi">Start your first translation</Link></p>
            </div>
          ) : (
            <div className="translations-list">
              {translations.map((translation) => (
                <div key={translation._id} className="translation-card">
                  <div className="translation-info">
                    <h3>{translation.originalFileName}</h3>
                    <div className="translation-meta">
                      <span className={`language-badge ${translation.language}`}>
                        {translation.language.charAt(0).toUpperCase() + translation.language.slice(1)}
                      </span>
                      <span className="page-count">{translation.pageCount} pages</span>
                      <span className="date">{formatDate(translation.createdAt)}</span>
                    </div>
                  </div>
                  <div className="translation-actions">
                    <Link 
                      to={`/translations/${translation._id}`} 
                      className="view-button"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <h2>Quick Actions</h2>
          <div className="quick-actions">
            <Link to="/hindi" className="quick-action-card">
              <h3>Translate Hindi</h3>
              <p>Upload a PDF with Hindi text for translation</p>
            </Link>
            <Link to="/sanskrit" className="quick-action-card">
              <h3>Translate Sanskrit</h3>
              <p>Upload a PDF with Sanskrit text for translation</p>
            </Link>
            <Link to="/translations" className="quick-action-card">
              <h3>My Translations</h3>
              <p>View and manage your translation history</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
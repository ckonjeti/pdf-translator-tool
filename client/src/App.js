import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import HindiPage from './HindiPage';
import SanskritPage from './SanskritPage';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import TranslationsList from './components/TranslationsList';
import TranslationDetail from './components/TranslationDetail';
import './App.css';

function Navigation() {
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  
  const handleLogout = async () => {
    await logout();
  };
  
  return (
    <nav className="modern-navigation">
      {/* Brand Logo */}
      <div className="nav-brand">
        <div className="brand-icon">
          <span className="brand-symbol">🕉️</span>
        </div>
        <div className="brand-text">
          <span className="brand-name">Sanskrit and Hindi PDF Translator</span>
          <span className="brand-subtitle">AI-Powered Translation</span>
        </div>
      </div>
      
      {/* Navigation Links */}
      <div className="nav-links">
        <Link 
          to="/hindi" 
          className={`nav-link ${location.pathname === '/hindi' ? 'active' : ''}`}
        >
          <span className="nav-text">Hindi</span>
        </Link>
        <Link 
          to="/sanskrit" 
          className={`nav-link ${location.pathname === '/sanskrit' ? 'active' : ''}`}
        >
          <span className="nav-text">Sanskrit</span>
        </Link>
        {isAuthenticated && (
          <>
            <Link 
              to="/dashboard" 
              className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}
            >
              <span className="nav-text">Dashboard</span>
            </Link>
            <Link 
              to="/translations" 
              className={`nav-link ${location.pathname === '/translations' ? 'active' : ''}`}
            >
              <span className="nav-text">My Translations</span>
            </Link>
          </>
        )}
      </div>
      
      {/* User Menu */}
      <div className="nav-user">
        {isAuthenticated ? (
          <div className="user-menu">
            <div className="user-avatar">
              <span className="avatar-text">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="user-info">
              <span className="user-name">{user?.name}</span>
              <span className="user-email">{user?.email}</span>
            </div>
            <button onClick={handleLogout} className="logout-button">
              <span>Logout</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        ) : (
          <div className="auth-buttons">
            <Link to="/login" className="auth-button signin">
              <span>Sign In</span>
            </Link>
            <Link to="/register" className="auth-button signup">
              <span>Sign Up</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

// Modern Loading Component
function ModernLoader() {
  return (
    <div className="modern-loader">
      <div className="loader-container">
        <div className="loader-animation">
          <div className="loader-ring"></div>
          <div className="loader-ring"></div>
          <div className="loader-ring"></div>
        </div>
        <div className="loader-text">
          <span className="loader-title">Loading...</span>
          <span className="loader-subtitle">Please wait while we prepare your experience</span>
        </div>
      </div>
    </div>
  );
}

// Protected Route component
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <ModernLoader />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
}

function AppContent() {
  return (
    <div className="modern-app">
      <Navigation />
      
      {/* Background Elements */}
      <div className="app-background">
        <div className="background-pattern"></div>
        <div className="background-gradient"></div>
      </div>

      <main className="modern-main">
        <div className="content-container">
          <Routes>
            <Route path="/" element={<Navigate to="/hindi" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/hindi" element={<HindiPage />} />
            <Route path="/sanskrit" element={<SanskritPage />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/translations" 
              element={
                <ProtectedRoute>
                  <TranslationsList />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/translations/:id" 
              element={
                <ProtectedRoute>
                  <TranslationDetail />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="modern-footer">
        <div className="footer-content">
          <span className="footer-text">© 2024 Sanskrit and Hindi PDF Translator - Powered by AI</span>
          <div className="footer-links">
            <span className="footer-link">Privacy</span>
            <span className="footer-link">Terms</span>
            <span className="footer-link">Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
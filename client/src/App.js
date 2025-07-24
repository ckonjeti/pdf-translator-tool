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
    <div className="tab-navigation">
      <div className="nav-left">
        <Link 
          to="/hindi" 
          className={`tab-button ${location.pathname === '/hindi' ? 'active' : ''}`}
        >
          Hindi
        </Link>
        <Link 
          to="/sanskrit" 
          className={`tab-button ${location.pathname === '/sanskrit' ? 'active' : ''}`}
        >
          Sanskrit
        </Link>
        {isAuthenticated && (
          <Link 
            to="/dashboard" 
            className={`tab-button ${location.pathname === '/dashboard' ? 'active' : ''}`}
          >
            Dashboard
          </Link>
        )}
      </div>
      
      <div className="nav-right">
        {isAuthenticated ? (
          <div className="user-menu">
            <span className="user-name">Hi, {user?.name}!</span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        ) : (
          <div className="auth-links">
            <Link to="/login" className="auth-link">Sign In</Link>
            <Link to="/register" className="auth-link primary">Sign Up</Link>
          </div>
        )}
      </div>
    </div>
  );
}

// Protected Route component
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
}

function AppContent() {
  return (
    <div className="App">
      <Navigation />

      <main className="main-content">
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
      </main>
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
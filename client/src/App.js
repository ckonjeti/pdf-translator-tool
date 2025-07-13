import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import HindiPage from './HindiPage';
import SanskritPage from './SanskritPage';
import './App.css';

function Navigation() {
  const location = useLocation();
  
  return (
    <div className="tab-navigation">
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
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <Navigation />

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/hindi" replace />} />
            <Route path="/hindi" element={<HindiPage />} />
            <Route path="/sanskrit" element={<SanskritPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
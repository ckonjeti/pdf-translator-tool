// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    req.userId = req.session.userId; // Ensure req.userId is set
    return next();
  } else {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please log in to access this resource'
    });
  }
};

// Optional authentication - adds user to request if logged in
const optionalAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
  }
  next();
};

// Redirect to login if not authenticated (for pages)
const requireAuthPage = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  } else {
    return res.redirect('/login');
  }
};

module.exports = {
  requireAuth,
  optionalAuth,
  requireAuthPage
};
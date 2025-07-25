// Authentication middleware
const requireAuth = (req, res, next) => {
  console.log('🔒 RequireAuth middleware - session exists:', !!req.session, 'userId:', req.session?.userId);
  if (req.session && req.session.userId) {
    req.userId = req.session.userId; // Ensure req.userId is set
    console.log('🔒 RequireAuth - Authentication successful, userId:', req.userId);
    return next();
  } else {
    console.log('🔒 RequireAuth - Authentication failed, returning 401');
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please log in to access this resource'
    });
  }
};

// Optional authentication - adds user to request if logged in
const optionalAuth = (req, res, next) => {
  console.log('OptionalAuth - session exists:', !!req.session, 'userId:', req.session?.userId);
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
    console.log('OptionalAuth - Setting req.userId to:', req.userId);
  } else {
    console.log('OptionalAuth - No valid session, proceeding without userId');
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
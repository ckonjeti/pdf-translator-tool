const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ 
        error: 'All fields are required',
        message: 'Please provide email, password, and name' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password too short',
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'User already exists',
        message: 'An account with this email already exists' 
      });
    }

    // Create new user
    const user = new User({
      email: email.toLowerCase(),
      password,
      name
    });

    await user.save();

    // Create session
    req.session.userId = user._id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;

    console.log('User registered successfully:', user.email);

    res.status(201).json({ 
      success: true,
      message: 'Account created successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Registration failed',
      message: 'An error occurred while creating your account' 
    });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Missing credentials',
        message: 'Please provide both email and password' 
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect' 
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email or password is incorrect' 
      });
    }

    // Create session
    req.session.userId = user._id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;

    console.log('User logged in successfully:', user.email);

    res.json({ 
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed',
      message: 'An error occurred during login' 
    });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ 
        error: 'Logout failed',
        message: 'An error occurred during logout' 
      });
    }
    
    res.clearCookie('connect.sid'); // Clear session cookie
    res.json({ 
      success: true,
      message: 'Logged out successfully' 
    });
  });
});

// Get current user endpoint
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password');
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'User account no longer exists' 
      });
    }

    res.json({ 
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Failed to get user',
      message: 'An error occurred while fetching user data' 
    });
  }
});

// Check authentication status
router.get('/status', (req, res) => {
  const isAuthenticated = !!(req.session && req.session.userId);
  res.json({ 
    isAuthenticated,
    user: isAuthenticated ? {
      id: req.session.userId,
      email: req.session.userEmail,
      name: req.session.userName
    } : null
  });
});

module.exports = router;
const express = require('express');
const mongoose = require('mongoose');
const Translation = require('../models/Translation');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Get user's translation history
router.get('/', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userId = req.session.userId || req.userId;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const translations = await Translation.find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('originalFileName language fileSize pageCount createdAt pages.pageNumber'); // Include page numbers but exclude large text fields

    const total = await Translation.countDocuments({ userId: userObjectId });

    res.json({
      success: true,
      translations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get translations error:', error);
    res.status(500).json({ 
      error: 'Failed to get translations',
      message: 'An error occurred while fetching your translations' 
    });
  }
});

// Get specific translation by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId || req.userId;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const translation = await Translation.findOne({ 
      _id: req.params.id, 
      userId: userObjectId 
    });

    if (!translation) {
      return res.status(404).json({ 
        error: 'Translation not found',
        message: 'Translation not found or you do not have access to it' 
      });
    }

    res.json({
      success: true,
      translation
    });

  } catch (error) {
    console.error('Get translation error:', error);
    res.status(500).json({ 
      error: 'Failed to get translation',
      message: 'An error occurred while fetching the translation' 
    });
  }
});

// Update translation page
router.put('/:id/pages/:pageIndex', requireAuth, async (req, res) => {
  try {
    const { originalText, translatedText } = req.body;
    const pageIndex = parseInt(req.params.pageIndex);

    if (isNaN(pageIndex) || pageIndex < 0) {
      return res.status(400).json({
        error: 'Invalid page index',
        message: 'Page index must be a valid number'
      });
    }

    const userId = req.session.userId || req.userId;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const translation = await Translation.findOne({ 
      _id: req.params.id, 
      userId: userObjectId 
    });

    if (!translation) {
      return res.status(404).json({ 
        error: 'Translation not found',
        message: 'Translation not found or you do not have access to it' 
      });
    }

    if (pageIndex >= translation.pages.length) {
      return res.status(400).json({
        error: 'Page not found',
        message: 'The specified page does not exist'
      });
    }

    // Update the specific page
    if (originalText !== undefined) {
      translation.pages[pageIndex].originalText = originalText;
    }
    if (translatedText !== undefined) {
      translation.pages[pageIndex].translatedText = translatedText;
    }

    await translation.save();

    res.json({
      success: true,
      message: 'Translation updated successfully',
      page: translation.pages[pageIndex]
    });

  } catch (error) {
    console.error('Update translation error:', error);
    res.status(500).json({ 
      error: 'Failed to update translation',
      message: 'An error occurred while updating the translation' 
    });
  }
});

// Delete translation
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId || req.userId;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const translation = await Translation.findOneAndDelete({ 
      _id: req.params.id, 
      userId: userObjectId 
    });

    if (!translation) {
      return res.status(404).json({ 
        error: 'Translation not found',
        message: 'Translation not found or you do not have access to it' 
      });
    }

    res.json({
      success: true,
      message: 'Translation deleted successfully'
    });

  } catch (error) {
    console.error('Delete translation error:', error);
    res.status(500).json({ 
      error: 'Failed to delete translation',
      message: 'An error occurred while deleting the translation' 
    });
  }
});

// Get user statistics
router.get('/stats/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId || req.userId;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const stats = await Translation.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: null,
          totalTranslations: { $sum: 1 },
          totalPages: { $sum: '$pageCount' },
          totalFileSize: { $sum: '$fileSize' },
          languageStats: {
            $push: '$language'
          }
        }
      }
    ]);

    const languageCounts = {};
    if (stats.length > 0) {
      stats[0].languageStats.forEach(lang => {
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      });
    }

    const recentTranslations = await Translation.find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('originalFileName language pageCount createdAt');

    res.json({
      success: true,
      stats: {
        totalTranslations: stats.length > 0 ? stats[0].totalTranslations : 0,
        totalPages: stats.length > 0 ? stats[0].totalPages : 0,
        totalFileSize: stats.length > 0 ? stats[0].totalFileSize : 0,
        languageCounts,
        recentTranslations
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get statistics',
      message: 'An error occurred while fetching your statistics' 
    });
  }
});

// Save a new translation
router.post('/save', requireAuth, async (req, res) => {
  try {
    const { 
      originalFileName, 
      language, 
      fileSize, 
      pages,
      customOcrPrompt,
      customTranslationPrompt
    } = req.body;

    if (!originalFileName || !language || !pages || !Array.isArray(pages)) {
      return res.status(400).json({
        error: 'Invalid translation data',
        message: 'Missing required fields: originalFileName, language, and pages'
      });
    }

    const userId = req.session.userId || req.userId;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    const newTranslation = new Translation({
      userId: userObjectId,
      originalFileName,
      language,
      fileSize: fileSize || 0,
      pageCount: pages.length,
      pages: pages.map(page => ({
        pageNumber: page.page || page.pageNumber,
        originalText: page.text || page.originalText,
        translatedText: page.translation || page.translatedText,
        imagePath: page.imagePath
      })),
      customOcrPrompt: customOcrPrompt || null,
      customTranslationPrompt: customTranslationPrompt || null
    });

    await newTranslation.save();

    res.json({
      success: true,
      message: 'Translation saved successfully',
      translation: {
        id: newTranslation._id,
        createdAt: newTranslation.createdAt
      }
    });

  } catch (error) {
    console.error('Save translation error:', error);
    res.status(500).json({
      error: 'Failed to save translation',
      message: 'An error occurred while saving the translation'
    });
  }
});

module.exports = router;
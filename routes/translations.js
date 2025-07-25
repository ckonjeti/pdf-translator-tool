const express = require('express');
const mongoose = require('mongoose');
const Translation = require('../models/Translation');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Get user's translation history
router.get('/', requireAuth, async (req, res) => {
  try {
    console.log('📋 Translations list request - userId:', req.userId, 'session.userId:', req.session?.userId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userId = req.session.userId || req.userId;
    console.log('📋 Using userId for translations:', userId);
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

    // Debug: Log what we're returning
    console.log(`DEBUG: Returning translation ${req.params.id}:`, {
      id: translation._id,
      fileName: translation.originalFileName,
      pageCount: translation.pageCount,
      pages: translation.pages.map(p => ({
        pageNumber: p.pageNumber,
        hasOriginalText: !!p.originalText,
        hasTranslatedText: !!p.translatedText,
        imagePath: p.imagePath,
        imagePathExists: p.imagePath ? 'YES' : 'NO'
      }))
    });

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

    // Clean up associated image files when translation is deleted
    try {
      const fs = require('fs-extra');
      const path = require('path');
      
      // Remove the entire directory if it's a saved translation
      const translationDir = path.join(__dirname, '..', 'uploads', 'saved', translation._id.toString());
      if (await fs.pathExists(translationDir)) {
        await fs.remove(translationDir);
        console.log(`Cleaned up translation directory: ${translationDir}`);
      } else {
        // Fallback: clean up individual images
        for (const page of translation.pages) {
          if (page.imagePath) {
            const imagePath = path.join(__dirname, '..', page.imagePath.replace('/uploads/', 'uploads/'));
            if (await fs.pathExists(imagePath)) {
              await fs.remove(imagePath);
              console.log(`Cleaned up image: ${page.imagePath}`);
            }
          }
        }
      }
    } catch (cleanupError) {
      console.warn('Failed to clean up images for deleted translation:', cleanupError.message);
      // Don't fail the deletion if cleanup fails
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
    console.log('📊 Dashboard stats request - userId:', req.userId, 'session.userId:', req.session?.userId);
    const userId = req.session.userId || req.userId;
    console.log('📊 Using userId for stats:', userId);
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
    
    // Create permanent directory for saved translation images
    const fs = require('fs-extra');
    const path = require('path');
    const translationId = new require('mongoose').Types.ObjectId();
    const permanentDir = path.join(__dirname, '..', 'uploads', 'saved', translationId.toString());
    await fs.ensureDir(permanentDir);
    
    // Copy images from temporary location to permanent location
    const updatedPages = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      let newImagePath = page.imagePath;
      
      console.log(`DEBUG: Processing page ${i}:`, {
        page: page.page,
        pageNumber: page.pageNumber,
        imagePath: page.imagePath,
        hasText: !!page.text,
        hasOriginalText: !!page.originalText,
        hasTranslation: !!page.translation, 
        hasTranslatedText: !!page.translatedText
      });
      
      if (page.imagePath) {
        try {
          const tempImagePath = path.join(__dirname, '..', page.imagePath.replace('/uploads/', 'uploads/'));
          const fileName = `page_${page.page || page.pageNumber}.png`;
          const permanentImagePath = path.join(permanentDir, fileName);
          
          console.log(`DEBUG: Image paths for page ${page.page || page.pageNumber}:`, {
            original: page.imagePath,
            temp: tempImagePath,
            permanent: permanentImagePath,
            fileName: fileName
          });
          
          if (await fs.pathExists(tempImagePath)) {
            await fs.copy(tempImagePath, permanentImagePath);
            newImagePath = `/uploads/saved/${translationId.toString()}/${fileName}`;
            console.log(`SUCCESS: Copied image to permanent location: ${newImagePath}`);
          } else {
            console.warn(`WARNING: Temp image not found: ${tempImagePath}`);
          }
        } catch (copyError) {
          console.warn(`Failed to copy image for page ${page.page || page.pageNumber}:`, copyError.message);
          // Keep original path if copy fails
        }
      }
      
      updatedPages.push({
        pageNumber: page.page || page.pageNumber,
        originalText: page.text || page.originalText,
        translatedText: page.translation || page.translatedText,
        imagePath: newImagePath
      });
    }
    
    const newTranslation = new Translation({
      _id: translationId,
      userId: userObjectId,
      originalFileName,
      language,
      fileSize: fileSize || 0,
      pageCount: pages.length,
      pages: updatedPages,
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
const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  originalFileName: {
    type: String,
    required: true
  },
  language: {
    type: String,
    required: true,
    enum: ['hindi', 'sanskrit', 'english']
  },
  fileSize: {
    type: Number,
    required: true
  },
  pageCount: {
    type: Number,
    required: true
  },
  pages: [{
    pageNumber: {
      type: Number,
      required: true
    },
    originalText: {
      type: String,
      required: true
    },
    translatedText: {
      type: String,
      required: true
    },
    imagePath: {
      type: String,
      required: true
    }
  }],
  customOcrPrompt: {
    type: String,
    default: null
  },
  customTranslationPrompt: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
translationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add index for faster queries
translationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Translation', translationSchema);
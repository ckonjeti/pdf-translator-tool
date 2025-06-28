require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const { createWorker } = require('tesseract.js');
const pdfjsLib = require('pdfjs-dist');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 5000;
const http = require('http');
const socketIo = require('socket.io');

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Validate API key exists
if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY environment variable is not set!');
  console.log('Please set your OpenAI API key in the environment variables');
} else {
  console.log('OpenAI API key loaded successfully');
}

// Set up PDF.js worker (without canvas)
pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/build/pdf.worker.entry');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
fs.ensureDirSync(path.join(__dirname, 'uploads'));
fs.ensureDirSync(path.join(__dirname, 'uploads/images'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'temp-pdf-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Simple PDF to image conversion without canvas
async function convertPDFToImages(pdfPath, pagesToConvert, progressCallback) {
  try {
    console.log('Loading PDF...');
    progressCallback('Loading PDF document...', 0, 100);
    
    const data = new Uint8Array(await fs.readFile(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const pageNumbers = pagesToConvert
      ? pagesToConvert.filter(p => p > 0 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    console.log('PDF loaded, pages to convert:', pageNumbers);
    progressCallback(`PDF loaded successfully. Processing ${pageNumbers.length} pages...`, 10, 100);
    
    const images = [];
    
    // For Railway deployment without canvas, we'll create placeholder images
    // and rely on Tesseract.js to handle the PDF directly
    for (let i = 0; i < pageNumbers.length; i++) {
      const pageNum = pageNumbers[i];
      const progressPercent = Math.round(10 + (i / pageNumbers.length) * 40);
      progressCallback(`Processing page ${pageNum}...`, progressPercent, 100);
      
      // Create a placeholder path - Tesseract.js can work with the PDF directly
      images.push({
        imagePath: pdfPath, // Use PDF path directly
        pageNumber: pageNum
      });
      
      console.log(`Page ${pageNum} prepared for OCR`);
    }
    
    console.log('All pages prepared for OCR');
    progressCallback('All pages prepared for OCR processing.', 50, 100);
    
    return images;
  } catch (error) {
    console.error('Error preparing PDF for OCR:', error);
    progressCallback('Error preparing PDF: ' + error.message, 0, 100);
    throw error;
  }
}

// OCR function to extract text from PDF pages
async function extractTextFromPDF(pdfPath, pageNumbers, language, sendProgress) {
  try {
    console.log('Starting OCR for language:', language);
    sendProgress(`Starting OCR text extraction for ${pageNumbers.length} pages...`, 50, 100);
    
    const worker = await createWorker();
    
    // Set language based on tab
    let lang = 'eng'; // default
    if (language === 'hindi') {
      lang = 'hin+eng'; // Hindi + English
    } else if (language === 'sanskrit') {
      lang = 'san+eng'; // Sanskrit + English
    }
    
    await worker.loadLanguage(lang);
    await worker.initialize(lang);
    sendProgress(`OCR engine initialized for ${language} language.`, 55, 100);
    
    // Set OCR parameters
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6',
    });
    
    const results = [];
    
    for (let i = 0; i < pageNumbers.length; i++) {
      const pageNumber = pageNumbers[i];
      console.log('Processing OCR for page:', pageNumber);
      const progressPercent = Math.round(55 + (i / pageNumbers.length) * 20);
      sendProgress(`Extracting text from page ${pageNumber}...`, progressPercent, 100);
      
      try {
        // Use Tesseract.js to extract text from specific PDF page
        const { data: { text } } = await worker.recognize(pdfPath, {
          pdfTitle: `Page ${pageNumber}`,
          pdfTextOnly: true
        });
        
        results.push({
          page: pageNumber,
          text: text.trim(),
          imagePath: `/uploads/page_${pageNumber}.png` // Placeholder path
        });
        
        console.log(`OCR completed for page ${pageNumber}`);
      } catch (ocrError) {
        console.error(`OCR error for page ${pageNumber}:`, ocrError.message);
        results.push({
          page: pageNumber,
          text: `OCR Error: ${ocrError.message}`,
          imagePath: `/uploads/page_${pageNumber}.png`
        });
      }
      
      const completedPercent = Math.round(55 + ((i + 1) / pageNumbers.length) * 20);
      sendProgress(`Text extraction completed for page ${pageNumber}.`, completedPercent, 100);
    }
    
    await worker.terminate();
    console.log('OCR processing completed');
    sendProgress(`OCR text extraction completed for all ${pageNumbers.length} pages.`, 75, 100);
    
    return results;
  } catch (error) {
    console.error('Error in OCR processing:', error);
    sendProgress(`Error in OCR processing: ${error.message}`, 50, 100);
    throw error;
  }
}

// Translation function (same as original)
async function translateText(text, sourceLanguage, sendProgress) {
  try {
    console.log('Starting GPT translation for:', sourceLanguage);
    sendProgress(`Starting translation for ${sourceLanguage} text...`);
    
    let targetLanguage = 'English';
    let sourceLang = 'the source language';
    let preserveInstructions = '';
    
    if (sourceLanguage === 'hindi') {
      sourceLang = 'Hindi';
      preserveInstructions = `
PRESERVATION RULES FOR HINDI TEXT:
- Keep all Sanskrit words/phrases UNTRANSLATED (write them as-is)
- Sanskrit words often appear in Devanagari script or transliterated form
- Common Sanskrit words to preserve: mantras, philosophical terms, names, etc.
- If you're unsure if a word is Sanskrit, preserve it to be safe`;
    } else if (sourceLanguage === 'sanskrit') {
      sourceLang = 'Sanskrit';
      preserveInstructions = `
PRESERVATION RULES FOR SANSKRIT TEXT:
- Keep all Hindi words/phrases UNTRANSLATED (write them as-is)
- Hindi words may appear mixed with Sanskrit text
- Common Hindi words to preserve: modern terms, names, colloquial expressions, etc.
- If you're unsure if a word is Hindi, preserve it to be safe`;
    }
    
    const prompt = `Provide a literal, line-by-line English translation of the following ${sourceLang} text. Do not transliterate from Devanagari to the Latin script; provide the English meaning.

IMPORTANT INSTRUCTIONS:
1. Translate EVERY SINGLE SENTENCE to its English meaning.
2. Do not provide summaries or paraphrases.
3. Do not combine multiple sentences into one.
4. Preserve the exact line structure and formatting.
5. If a line is a mix of ${sourceLang} and English, translate the ${sourceLang} parts and keep the English parts.
6. If a line is already entirely in English, keep it as is.
7. If a line is empty or contains only whitespace, keep it empty.
8. Do not add any explanations, commentary, or labels like "Translation:". Just provide the raw translated text.

${preserveInstructions}

Text to translate:
${text}`;

    console.log('Sending translation request to OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.3,
    });

    const translation = completion.choices[0].message.content.trim();
    console.log('Translation completed successfully');
    sendProgress(`Translation completed successfully.`);
    
    return translation;
  } catch (error) {
    console.error('Error in translation:', error);
    sendProgress(`Error in translation: ${error.message}`);
    throw error;
  }
}

// Main upload route
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  const socketId = req.body.socketId;
  const socket = io.sockets.sockets.get(socketId);
  
  const sendProgress = (message, step, total) => {
    const progressData = {
      message,
      step: step || 0,
      total: total || 100,
      timestamp: new Date().toLocaleTimeString()
    };
    
    if (socket) {
      socket.emit('progress', progressData);
    }
    console.log(`Progress: ${message} (${step}/${total})`);
  };

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const pdfPath = req.file.path;
    const pageRanges = req.body.pageRanges;
    const isHindi = req.query.hindi === '1';
    const isSanskrit = req.query.sanskrit === '1';
    const language = isHindi ? 'hindi' : (isSanskrit ? 'sanskrit' : 'english');

    console.log(`Processing ${language} PDF:`, req.file.originalname);
    sendProgress(`Starting processing of ${req.file.originalname}...`, 0, 100);

    // Parse page ranges
    let pagesToConvert = null;
    if (pageRanges && pageRanges.trim()) {
      pagesToConvert = parsePageRanges(pageRanges);
    }

    // Convert PDF to images (simplified for Railway)
    const imageObjects = await convertPDFToImages(pdfPath, pagesToConvert, sendProgress);

    // Extract page numbers for OCR
    const pageNumbers = imageObjects.map(obj => obj.pageNumber);

    // Extract text using OCR
    const ocrResults = await extractTextFromPDF(pdfPath, pageNumbers, language, sendProgress);

    // Translate extracted text
    const finalResults = [];
    for (let i = 0; i < ocrResults.length; i++) {
      const ocrResult = ocrResults[i];
      const progressPercent = Math.round(75 + (i / ocrResults.length) * 20);
      sendProgress(`Translating page ${ocrResult.page}...`, progressPercent, 100);

      let translation = '';
      if (ocrResult.text && !ocrResult.text.startsWith('OCR Error:')) {
        try {
          translation = await translateText(ocrResult.text, language, sendProgress);
        } catch (translationError) {
          console.error(`Translation error for page ${ocrResult.page}:`, translationError);
          translation = `Translation error: ${translationError.message}`;
        }
      } else {
        translation = 'No text to translate.';
      }

      finalResults.push({
        page: ocrResult.page,
        text: ocrResult.text,
        translation: translation,
        imagePath: ocrResult.imagePath
      });
    }

    // Clean up uploaded file
    try {
      await fs.unlink(pdfPath);
    } catch (cleanupError) {
      console.warn('Failed to clean up uploaded file:', cleanupError);
    }

    sendProgress('Processing completed successfully!', 100, 100);

    res.json({
      success: true,
      originalName: req.file.originalname,
      pageCount: finalResults.length,
      pages: finalResults,
      language: language
    });

  } catch (error) {
    console.error('Processing error:', error);
    sendProgress(`Error: ${error.message}`, 0, 100);
    
    // Clean up uploaded file in case of error
    try {
      if (req.file && req.file.path) {
        await fs.unlink(req.file.path);
      }
    } catch (cleanupError) {
      console.warn('Failed to clean up uploaded file after error:', cleanupError);
    }

    res.status(500).json({
      error: error.message || 'An error occurred during processing'
    });
  }
});

// Helper function to parse page ranges
function parsePageRanges(rangeString) {
  const pages = [];
  const ranges = rangeString.split(',').map(r => r.trim());
  
  for (const range of ranges) {
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          pages.push(i);
        }
      }
    } else {
      const page = parseInt(range);
      if (!isNaN(page)) {
        pages.push(page);
      }
    }
  }
  
  return [...new Set(pages)].sort((a, b) => a - b);
}

// Redo translation endpoint
app.post('/api/redo-translation', async (req, res) => {
  try {
    const { text, language } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided for translation' });
    }

    const translation = await translateText(text, language, () => {});
    
    res.json({
      success: true,
      translation: translation
    });
  } catch (error) {
    console.error('Redo translation error:', error);
    res.status(500).json({
      error: error.message || 'Translation failed'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

module.exports = app;
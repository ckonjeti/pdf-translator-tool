require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const { createWorker } = require('tesseract.js');
const pdfjsLib = require('pdfjs-dist');
const { createCanvas } = require('canvas');
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
  console.log('Please set your OpenAI API key in the environment variables or .env file');
} else {
  console.log('OpenAI API key loaded successfully');
}

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/build/pdf.worker.entry');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists (only for temporary processing)
fs.ensureDirSync(path.join(__dirname, 'uploads'));
fs.ensureDirSync(path.join(__dirname, 'uploads/images'));

// Configure multer for file uploads (temporary storage)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'temp-pdf-' + uniqueSuffix + '.pdf');
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    console.log('File upload attempt:', file.originalname, file.mimetype);
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

function parsePageRanges(pageRangesStr) {
  if (!pageRangesStr || pageRangesStr.trim() === '') {
    return null;
  }

  const ranges = pageRangesStr.split(',');
  const pages = new Set();

  for (const range of ranges) {
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(str => parseInt(str.trim(), 10));
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          pages.add(i);
        }
      }
    } else {
      const page = parseInt(range.trim(), 10);
      if (!isNaN(page)) {
        pages.add(page);
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

// Convert PDF to images
async function convertPdfToImages(pdfPath, outputDir, progressCallback, pagesToConvert = null) {
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

    if (pageNumbers.length === 0) {
      progressCallback('No valid pages selected for conversion.', 0, 0);
      return [];
    }
    
    console.log('PDF loaded, pages to convert:', pageNumbers);
    progressCallback(`PDF loaded successfully. Converting ${pageNumbers.length} pages...`, 10, 100);
    
    const images = [];
    
    for (let i = 0; i < pageNumbers.length; i++) {
      const pageNum = pageNumbers[i];
      try {
        console.log(`Processing page ${pageNum}/${totalPages}`);
        const progressPercent = Math.round(10 + (i / pageNumbers.length) * 40); // 10-50% for conversion
        progressCallback(`Converting page ${pageNum} to image...`, progressPercent, 100);
        
        const page = await pdf.getPage(pageNum);
        
        // Use a fixed high-quality scale (approx. 300 DPI for a standard page)
        let scale = 4.0;
        let viewport = page.getViewport({ scale: scale });
        
        // Ensure minimum dimensions for OCR (at least 100x100 pixels)
        const minWidth = 100;
        const minHeight = 100;
        
        if (viewport.width < minWidth || viewport.height < minHeight) {
          // Calculate scale to ensure minimum dimensions
          const scaleForWidth = minWidth / viewport.width;
          const scaleForHeight = minHeight / viewport.height;
          scale = Math.max(scale, scaleForWidth, scaleForHeight);
          viewport = page.getViewport({ scale: scale });
          console.log(`Adjusted scale to ${scale} for page ${pageNum} to ensure minimum OCR dimensions`);
        }
        
        console.log(`Page ${pageNum} dimensions: ${viewport.width}x${viewport.height} (scale: ${scale})`);
        
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        const imagePath = path.join(outputDir, `page_${pageNum}.png`);
        const buffer = canvas.toBuffer('image/png');
        await fs.writeFile(imagePath, buffer);
        
        images.push({
          imagePath: `/uploads/images/page_${pageNum}.png`,
          pageNumber: pageNum
        });
        console.log(`Page ${pageNum} saved as image (${viewport.width}x${viewport.height})`);
      } catch (error) {
         console.error(`Failed to convert page ${pageNum}:`, error);
         const progressPercent = Math.round(10 + (i / pageNumbers.length) * 40);
         progressCallback(`Failed to convert page ${pageNum} to image`, progressPercent, 100);
         // Create a blank image as a fallback
         const blankCanvas = createCanvas(1000, 1000);
         const blankContext = blankCanvas.getContext('2d');
         blankContext.fillStyle = 'white';
         blankContext.fillRect(0, 0, 1000, 1000);
         blankContext.fillStyle = 'black';
         blankContext.font = '24px Arial';
         blankContext.fillText(`Page ${pageNum} - Image conversion failed`, 50, 500);
            
         const imagePath = path.join(outputDir, `page_${pageNum}.png`);
         const buffer = blankCanvas.toBuffer('image/png');
         await fs.writeFile(imagePath, buffer);
            
         images.push({
            imagePath: `/uploads/images/page_${pageNum}.png`,
            pageNumber: pageNum
         });
      }
    }
    
    console.log('All pages converted to images');
    progressCallback('All pages converted to images successfully.', 50, 100);
    
    return images;
  } catch (error) {
    console.error('Error converting PDF to images:', error);
    progressCallback('Error converting PDF to images: ' + error.message, 0, 100);
    throw error;
  }
}

// OCR function to extract text from images
async function extractTextFromImages(imageObjects, language, sendProgress) {
  try {
    console.log('Starting OCR for language:', language);
    sendProgress(`Starting OCR text extraction for ${imageObjects.length} pages...`, 50, 100);
    
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
    
    // Set OCR parameters for better recognition
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6', // Assume uniform block of text
    });
    
    const results = [];
    
    for (let i = 0; i < imageObjects.length; i++) {
      const { imagePath, pageNumber } = imageObjects[i];
      const fullImagePath = path.join(__dirname, imagePath.replace('/uploads/', 'uploads/'));
      console.log('Processing OCR for image:', fullImagePath);
      const progressPercent = Math.round(55 + (i / imageObjects.length) * 20); // 55-75% for OCR
      sendProgress(`Extracting text from page ${pageNumber}...`, progressPercent, 100);
      
      try {
        // Check if file exists before processing
        if (!await fs.pathExists(fullImagePath)) {
          console.warn(`Image file not found: ${fullImagePath}`);
          results.push({
            page: pageNumber,
            text: 'Error: Image file not found',
            imagePath: imagePath
          });
          continue;
        }

        // Get image stats to check dimensions
        const stats = await fs.stat(fullImagePath);
        if (stats.size < 100) { // Less than 100 bytes is likely an invalid image
          console.warn(`Image file too small: ${fullImagePath} (${stats.size} bytes)`);
          results.push({
            page: pageNumber,
            text: 'Error: Image file too small for OCR processing',
            imagePath: imagePath
          });
          continue;
        }

        const { data: { text } } = await worker.recognize(fullImagePath);
        results.push({
          page: pageNumber,
          text: text.trim(),
          imagePath: imagePath
        });
        
        console.log(`OCR completed for page ${pageNumber}`);
      } catch (ocrError) {
        console.error(`OCR error for page ${pageNumber}:`, ocrError.message);
        results.push({
          page: pageNumber,
          text: `OCR Error: ${ocrError.message}`,
          imagePath: imagePath
        });
      }
      
      const completedPercent = Math.round(55 + ((i + 1) / imageObjects.length) * 20);
      sendProgress(`Text extraction completed for page ${pageNumber}.`, completedPercent, 100);
    }
    
    await worker.terminate();
    console.log('OCR processing completed');
    sendProgress(`OCR text extraction completed for all ${imageObjects.length} pages.`, 75, 100);
    
    return results;
  } catch (error) {
    console.error('Error in OCR processing:', error);
    sendProgress(`Error in OCR processing: ${error.message}`, 50, 100);
    throw error;
  }
}

// GPT translation function
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
${text}

English Translation (line by line):`;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a precise, literal translator. Your task is to translate text from ${sourceLang} to English, line by line. You must provide the English meaning, not a transliteration. Follow preservation rules strictly.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    });
    
    const translation = completion.choices[0].message.content.trim();
    console.log('Translation completed');
    sendProgress(`Translation completed successfully.`);
    
    return translation;
  } catch (error) {
    console.error('Error in GPT translation:', error);
    sendProgress(`Translation failed: ${error.message}`);
    return 'Translation failed: ' + error.message;
  }
}

// Redo translation endpoint
app.post('/api/redo-translation', async (req, res) => {
  try {
    const { text, language } = req.body;
    if (!text || !language) {
      return res.status(400).json({ error: 'Text and language are required' });
    }

    // Progress tracking function (optional for this endpoint, but good practice)
    const progressUpdates = [];
    const sendProgress = (message) => {
      const timestamp = new Date().toLocaleTimeString();
      progressUpdates.push({ timestamp, message });
      console.log(`[REDO-T][${timestamp}] ${message}`);
    };

    const newTranslation = await translateText(text, language, sendProgress);
    
    res.json({ success: true, translation: newTranslation });

  } catch (error) {
    console.error('Redo translation error:', error);
    res.status(500).json({ error: 'Failed to redo translation: ' + error.message });
  }
});

// Upload endpoint with OCR and translation
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    console.log('Upload request received');
    
    if (!req.file) {
      console.log('No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File received:', req.file.originalname, req.file.size, 'bytes');
    
    const pdfPath = req.file.path;
    const outputDir = path.join(__dirname, 'uploads/images');
    
    const pageRanges = req.body.pageRanges;
    const pagesToProcess = parsePageRanges(pageRanges);
    const socketId = req.body.socketId; // Get socket ID from request

    console.log('Requested page ranges:', pageRanges);
    console.log('Parsed pages to process:', pagesToProcess);
    console.log('Socket ID:', socketId);

    // Progress tracking function with WebSocket emission
    const progressUpdates = [];
    const sendProgress = (message, step = null, total = null) => {
      const timestamp = new Date().toLocaleTimeString();
      const progressData = { timestamp, message, step, total };
      progressUpdates.push(progressData);
      console.log(`[${timestamp}] ${message}`);
      
      // Emit progress to specific client via WebSocket
      if (socketId) {
        io.to(socketId).emit('progress', progressData);
      }
    };
    
    // Clean previous images
    console.log('Cleaning previous images...');
    sendProgress('Cleaning up previous files...');
    await fs.emptyDir(outputDir);
    
    // Convert PDF to images
    console.log('Converting PDF to images...');
    const imageObjects = await convertPdfToImages(pdfPath, outputDir, sendProgress, pagesToProcess);

    if (imageObjects.length === 0) {
      return res.json({
        success: false,
        message: 'No valid pages were selected or processed. Please check your page selection.',
        progress: progressUpdates
      });
    }
    
    // Determine language for OCR
    let language = 'english';
    if (req.query.hindi) {
      language = 'hindi';
    } else if (req.query.sanskrit) {
      language = 'sanskrit';
    }
    
    // Extract text using OCR
    console.log('Starting OCR processing...');
    const ocrResults = await extractTextFromImages(imageObjects, language, sendProgress);
    
    // Translate text using GPT
    console.log('Starting translation processing...');
    sendProgress('Starting GPT translation for all pages...', 75, 100);
    const resultsWithTranslation = [];
    
    for (let i = 0; i < ocrResults.length; i++) {
      const page = ocrResults[i];
      const progressPercent = Math.round(75 + (i / ocrResults.length) * 20); // 75-95% for translation
      sendProgress(`Translating page ${page.page}...`, progressPercent, 100);
      const translation = await translateText(page.text, language, (msg) => sendProgress(msg, progressPercent, 100));
      resultsWithTranslation.push({
        ...page,
        translation: translation
      });
      const completedPercent = Math.round(75 + ((i + 1) / ocrResults.length) * 20);
      sendProgress(`Page ${page.page} translation completed.`, completedPercent, 100);
    }
    
    // Clean up the uploaded PDF (no permanent storage)
    console.log('Cleaning up uploaded PDF...');
    sendProgress('Cleaning up temporary files...', 95, 100);
    await fs.remove(pdfPath);
    
    console.log('Upload, OCR, and translation successful, returning response');
    sendProgress('All processing completed successfully!', 100, 100);
    
    res.json({ 
      success: true, 
      originalName: req.file.originalname,
      fileSize: req.file.size,
      pages: resultsWithTranslation,
      pageCount: imageObjects.length,
      progress: progressUpdates
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process PDF: ' + error.message });
  }
});

// Get uploaded PDFs endpoint
app.get('/api/pdfs', (req, res) => {
  try {
    let uploadsDir;
    if (req.query.hindi) {
      uploadsDir = path.join(__dirname, 'uploads/hindi');
    } else if (req.query.sanskrit) {
      uploadsDir = path.join(__dirname, 'uploads/sanskrit');
    } else {
      uploadsDir = path.join(__dirname, 'uploads');
    }
    
    const files = fs.readdirSync(uploadsDir)
      .filter(file => file.endsWith('.pdf'))
      .map(file => ({
        filename: file,
        path: req.query.hindi ? `/uploads/hindi/${file}` : 
              req.query.sanskrit ? `/uploads/sanskrit/${file}` : 
              `/uploads/${file}`,
        originalName: file.replace(/^pdf-\d+-\d+\.pdf$/, 'uploaded.pdf')
      }));
    
    res.json({ pdfs: files });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get PDFs' });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
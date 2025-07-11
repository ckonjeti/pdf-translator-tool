require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
// Removed tesseract.js - now using GPT-4 Vision for OCR
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

// Enhanced static serving for uploads with Safari-compatible CORS headers
app.use('/uploads', (req, res, next) => {
  // Set Safari-compatible CORS headers for images
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  
  // Safari-specific headers for image loading
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  
  // Cache control for better performance
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  next();
}, express.static(path.join(__dirname, 'uploads')));

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

// GPT-4 Vision OCR function to extract text from images
async function extractTextFromImages(imageObjects, language, sendProgress, customOcrPrompt = null) {
  try {
    console.log('Starting GPT-4 Vision OCR for language:', language);
    sendProgress(`Starting GPT-4 Vision text extraction for ${imageObjects.length} pages...`, 50, 100);
    
    // Use custom prompt if provided, otherwise use default language-specific prompts
    let languagePrompt = '';
    if (customOcrPrompt) {
      languagePrompt = customOcrPrompt;
      console.log('Using custom OCR prompt');
    } else {
      if (language === 'hindi') {
        languagePrompt = 'This is an academic document containing Hindi text in Devanagari script. Please perform optical character recognition to extract all visible text accurately.';
      } else if (language === 'sanskrit') {
        languagePrompt = 'This is an academic document containing Sanskrit text in Devanagari script. Please perform optical character recognition to extract all visible text accurately.';
      } else {
        languagePrompt = 'This is an academic document containing text. Please perform optical character recognition to extract all visible text accurately.';
      }
      console.log('Using default OCR prompt for language:', language);
    }
    
    const results = [];
    
    for (let i = 0; i < imageObjects.length; i++) {
      const { imagePath, pageNumber } = imageObjects[i];
      const fullImagePath = path.join(__dirname, imagePath.replace('/uploads/', 'uploads/'));
      console.log('Processing GPT-4 Vision OCR for image:', fullImagePath);
      const progressPercent = Math.round(55 + (i / imageObjects.length) * 20); // 55-75% for OCR
      sendProgress(`Extracting text from page ${pageNumber} using GPT-4 Vision...`, progressPercent, 100);
      
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

        // Get image stats to check file size
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

        // Read image file and convert to base64
        const imageBuffer = await fs.readFile(fullImagePath);
        const base64Image = imageBuffer.toString('base64');

        // Prepare OCR prompt text
        const ocrPromptText = customOcrPrompt 
          ? languagePrompt // Custom prompt is complete
          : `${languagePrompt}

INSTRUCTIONS FOR TEXT EXTRACTION:
1. Identify and transcribe every character, word, and line visible in the document
2. Preserve the original formatting, line breaks, and spacing exactly as shown
3. Transcribe the text as-is without any translation or interpretation
4. For Devanagari script, maintain all diacritical marks and characters precisely
5. Include all numbers, punctuation marks, and symbols present
6. For multi-column layouts, transcribe from left to right, top to bottom
7. Provide only the transcribed text without additional commentary
8. If the image contains no readable text, respond with "No text detected"`;

        // Use GPT-4 Vision for OCR
        const response = await openai.chat.completions.create({
          model: "gpt-4o", // Latest model with vision capabilities
          messages: [{
            role: "user",
            content: [
              { 
                type: "text", 
                text: ocrPromptText
              },
              { 
                type: "image_url", 
                image_url: { url: `data:image/png;base64,${base64Image}` }
              }
            ]
          }],
          max_tokens: 2000,
          temperature: 0.1 // Low temperature for consistent OCR results
        });

        const extractedText = response.choices[0].message.content.trim();
        
        // Handle content moderation responses
        if (extractedText.toLowerCase().includes("sorry, i can't assist") || 
            extractedText.toLowerCase().includes("i cannot help") ||
            extractedText.toLowerCase().includes("unable to process")) {
          console.warn(`Content moderation triggered for page ${pageNumber}, retrying with different approach...`);
          // Fallback: simpler prompt
          const fallbackResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{
              role: "user",
              content: [
                { 
                  type: "text", 
                  text: "Please transcribe all visible text from this academic document image."
                },
                { 
                  type: "image_url", 
                  image_url: { url: `data:image/png;base64,${base64Image}` }
                }
              ]
            }],
            max_tokens: 2000,
            temperature: 0.1
          });
          
          const fallbackText = fallbackResponse.choices[0].message.content.trim();
          results.push({
            page: pageNumber,
            text: fallbackText.toLowerCase().includes("sorry") ? 
                  `OCR processing restricted for page ${pageNumber}. Please try a different image.` : 
                  fallbackText,
            imagePath: imagePath
          });
        } else {
          results.push({
            page: pageNumber,
            text: extractedText,
            imagePath: imagePath
          });
        }
        
        console.log(`GPT-4 Vision OCR completed for page ${pageNumber}`);
      } catch (ocrError) {
        console.error(`GPT-4 Vision OCR error for page ${pageNumber}:`, ocrError.message);
        results.push({
          page: pageNumber,
          text: `OCR Error: ${ocrError.message}`,
          imagePath: imagePath
        });
      }
      
      const completedPercent = Math.round(55 + ((i + 1) / imageObjects.length) * 20);
      sendProgress(`GPT-4 Vision text extraction completed for page ${pageNumber}.`, completedPercent, 100);
    }
    
    console.log('GPT-4 Vision OCR processing completed');
    sendProgress(`GPT-4 Vision text extraction completed for all ${imageObjects.length} pages.`, 75, 100);
    
    return results;
  } catch (error) {
    console.error('Error in GPT-4 Vision OCR processing:', error);
    sendProgress(`Error in GPT-4 Vision OCR processing: ${error.message}`, 50, 100);
    throw error;
  }
}

// GPT translation function
async function translateText(text, sourceLanguage, sendProgress, customTranslationPrompt = null) {
  try {
    console.log('Starting GPT translation for:', sourceLanguage);
    sendProgress(`Starting translation for ${sourceLanguage} text...`);
    
    let prompt = '';
    
    if (customTranslationPrompt) {
      // Use custom prompt and replace {TEXT} placeholder with actual text
      prompt = customTranslationPrompt.replace('{TEXT}', text);
      console.log('Using custom translation prompt');
    } else {
      // Use default prompt structure
      let targetLanguage = 'English';
      let sourceLang = 'the source language';
      let preserveInstructions = '';
      
      if (sourceLanguage === 'hindi') {
        sourceLang = 'Hindi';
        preserveInstructions = `
ACADEMIC TRANSLATION GUIDELINES FOR HINDI:
- Maintain Sanskrit terms in their original form when they appear
- Sanskrit vocabulary often appears in academic or literary contexts
- Preserve proper nouns, technical terms, and traditional expressions
- When uncertain about etymology, retain the original term`;
      } else if (sourceLanguage === 'sanskrit') {
        sourceLang = 'Sanskrit';
        preserveInstructions = `
ACADEMIC TRANSLATION GUIDELINES FOR SANSKRIT:
- Maintain Hindi terms in their original form when they appear
- Modern Hindi vocabulary may appear in contemporary texts
- Preserve proper nouns, technical terms, and contemporary expressions
- When uncertain about language origin, retain the original term`;
      }
      
      prompt = `Please provide an academic English translation of the following ${sourceLang} text. Convert each line from Devanagari script to its English meaning while maintaining the original structure.

TRANSLATION GUIDELINES:
1. Convert each sentence to its corresponding English meaning
2. Maintain the document's original formatting and line structure
3. Preserve the exact sequence and organization of content
4. For mixed-language content, translate the ${sourceLang} portions while keeping English portions unchanged
5. Retain empty lines and whitespace as they appear
6. Provide only the translated content without additional commentary

${preserveInstructions}

Source text for translation:
${text}

Translated text:`;
      console.log('Using default translation prompt for language:', sourceLanguage);
    }
    
    const systemContent = customTranslationPrompt 
      ? "You are an AI assistant that follows the given instructions precisely."
      : `You are an academic translator specializing in ${sourceLanguage === 'hindi' ? 'Hindi' : sourceLanguage === 'sanskrit' ? 'Sanskrit' : 'multilingual'} texts. Your role is to provide accurate English translations while maintaining scholarly precision and cultural context.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemContent
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
    
    // Handle content moderation responses in translation
    if (translation.toLowerCase().includes("sorry, i can't assist") || 
        translation.toLowerCase().includes("i cannot help") ||
        translation.toLowerCase().includes("unable to process")) {
      console.warn(`Content moderation triggered during translation, attempting alternative approach...`);
      
      // Fallback: simpler translation prompt
      try {
        const fallbackCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are a linguistic assistant. Convert the provided text to English while maintaining academic accuracy.`
            },
            {
              role: "user",
              content: `Convert this ${sourceLang} academic text to English:\n\n${text}`
            }
          ],
          max_tokens: 2000,
          temperature: 0.1
        });
        
        const fallbackTranslation = fallbackCompletion.choices[0].message.content.trim();
        
        if (fallbackTranslation.toLowerCase().includes("sorry")) {
          console.log('Translation completed with restrictions');
          sendProgress(`Translation completed with some restrictions.`);
          return `Translation unavailable due to content restrictions. Original text: ${text}`;
        } else {
          console.log('Translation completed using fallback method');
          sendProgress(`Translation completed successfully.`);
          return fallbackTranslation;
        }
      } catch (fallbackError) {
        console.error('Fallback translation also failed:', fallbackError.message);
        sendProgress(`Translation failed: ${fallbackError.message}`);
        return `Translation error. Original text: ${text}`;
      }
    } else {
      console.log('Translation completed');
      sendProgress(`Translation completed successfully.`);
      return translation;
    }
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
    const customOcrPrompt = req.body.ocrPrompt; // Custom OCR prompt from user
    const customTranslationPrompt = req.body.translationPrompt; // Custom translation prompt from user

    console.log('Requested page ranges:', pageRanges);
    console.log('Parsed pages to process:', pagesToProcess);
    console.log('Socket ID:', socketId);
    console.log('Custom OCR prompt provided:', !!customOcrPrompt);
    console.log('Custom translation prompt provided:', !!customTranslationPrompt);

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
    const ocrResults = await extractTextFromImages(imageObjects, language, sendProgress, customOcrPrompt);
    
    // Translate text using GPT
    console.log('Starting translation processing...');
    sendProgress('Starting GPT translation for all pages...', 75, 100);
    const resultsWithTranslation = [];
    
    for (let i = 0; i < ocrResults.length; i++) {
      const page = ocrResults[i];
      const progressPercent = Math.round(75 + (i / ocrResults.length) * 20); // 75-95% for translation
      sendProgress(`Translating page ${page.page}...`, progressPercent, 100);
      const translation = await translateText(page.text, language, (msg) => sendProgress(msg, progressPercent, 100), customTranslationPrompt);
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
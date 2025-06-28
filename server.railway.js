require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const { createWorker } = require('tesseract.js');
const pdfjsLib = require('pdfjs-dist');
const OpenAI = require('openai');

// Try to import canvas, but provide fallback if not available
let createCanvas;
try {
  const canvas = require('canvas');
  createCanvas = canvas.createCanvas;
  console.log('Canvas module loaded successfully');
} catch (error) {
  console.log('Canvas module not available, using fallback approach');
  createCanvas = null;
}

const app = express();
const PORT = process.env.PORT || 5000;

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

// Convert PDF to images with fallback for canvas
async function convertPdfToImages(pdfPath, outputDir, progressCallback, pagesToConvert = null) {
  try {
    console.log('Loading PDF...');
    progressCallback('Loading PDF document...');
    
    const data = new Uint8Array(await fs.readFile(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const pageNumbers = pagesToConvert
      ? pagesToConvert.filter(p => p > 0 && p <= totalPages)
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    if (pageNumbers.length === 0) {
      progressCallback('No valid pages selected for conversion.');
      return [];
    }
    
    console.log('PDF loaded, pages to convert:', pageNumbers);
    progressCallback(`PDF loaded successfully. Converting ${pageNumbers.length} pages...`);
    
    const images = [];
    
    for (const pageNum of pageNumbers) {
      try {
        console.log(`Processing page ${pageNum}/${totalPages}`);
        progressCallback(`Converting page ${pageNum} to image...`);
        
        const page = await pdf.getPage(pageNum);
        
        // Use a fixed high-quality scale (approx. 300 DPI for a standard page)
        const scale = 4.0;
        const viewport = page.getViewport({ scale: scale });
        
        if (createCanvas) {
          // Use canvas if available
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
        } else {
          // Fallback: create a placeholder image
          console.log('Canvas not available, creating placeholder image');
          const placeholderPath = path.join(outputDir, `page_${pageNum}.png`);
          
          // Create a simple SVG placeholder
          const svgContent = `
            <svg width="${viewport.width}" height="${viewport.height}" xmlns="http://www.w3.org/2000/svg">
              <rect width="100%" height="100%" fill="white"/>
              <text x="50%" y="50%" font-family="Arial" font-size="24" text-anchor="middle" fill="black">
                Page ${pageNum} - Canvas not available
              </text>
              <text x="50%" y="60%" font-family="Arial" font-size="16" text-anchor="middle" fill="gray">
                PDF processing available, image conversion limited
              </text>
            </svg>
          `;
          
          // Convert SVG to PNG using a simple approach
          // For now, we'll create a text file as placeholder
          await fs.writeFile(placeholderPath.replace('.png', '.txt'), 
            `Page ${pageNum} - Canvas module not available for image conversion.\n` +
            `PDF text extraction and OCR will still work.\n` +
            `Page dimensions: ${viewport.width}x${viewport.height}`
          );
          
          // Create a simple PNG using a different approach
          const { createCanvas: createCanvasFallback } = require('canvas');
          const canvas = createCanvasFallback(viewport.width, viewport.height);
          const context = canvas.getContext('2d');
          context.fillStyle = 'white';
          context.fillRect(0, 0, viewport.width, viewport.height);
          context.fillStyle = 'black';
          context.font = '24px Arial';
          context.textAlign = 'center';
          context.fillText(`Page ${pageNum}`, viewport.width / 2, viewport.height / 2 - 20);
          context.font = '16px Arial';
          context.fillText('Canvas not available', viewport.width / 2, viewport.height / 2 + 20);
          
          const buffer = canvas.toBuffer('image/png');
          await fs.writeFile(placeholderPath, buffer);
        }
        
        images.push({
          imagePath: `/uploads/images/page_${pageNum}.png`,
          pageNumber: pageNum
        });
        console.log(`Page ${pageNum} processed`);
      } catch (error) {
         console.error(`Failed to convert page ${pageNum}:`, error);
         progressCallback(`Failed to convert page ${pageNum} to image`);
         
         // Create a simple error placeholder
         const errorPath = path.join(outputDir, `page_${pageNum}.png`);
         try {
           const { createCanvas: createCanvasError } = require('canvas');
           const canvas = createCanvasError(1000, 1000);
           const context = canvas.getContext('2d');
           context.fillStyle = 'white';
           context.fillRect(0, 0, 1000, 1000);
           context.fillStyle = 'red';
           context.font = '24px Arial';
           context.textAlign = 'center';
           context.fillText(`Page ${pageNum} - Error`, 500, 450);
           context.fillStyle = 'black';
           context.font = '16px Arial';
           context.fillText('Image conversion failed', 500, 500);
           
           const buffer = canvas.toBuffer('image/png');
           await fs.writeFile(errorPath, buffer);
         } catch (canvasError) {
           // If even the error canvas fails, create a text file
           await fs.writeFile(errorPath.replace('.png', '.txt'), 
             `Page ${pageNum} - Conversion failed: ${error.message}`
           );
         }
            
         images.push({
            imagePath: `/uploads/images/page_${pageNum}.png`,
            pageNumber: pageNum
         });
      }
    }
    
    console.log('All pages processed');
    progressCallback('All pages processed successfully.');
    
    return images;
  } catch (error) {
    console.error('Error converting PDF to images:', error);
    progressCallback('Error converting PDF to images: ' + error.message);
    throw error;
  }
}

// OCR function to extract text from images
async function extractTextFromImages(imageObjects, language, sendProgress) {
  try {
    console.log('Starting OCR for language:', language);
    sendProgress(`Starting OCR text extraction for ${imageObjects.length} pages...`);
    
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
    sendProgress(`OCR engine initialized for ${language} language.`);
    
    // Set OCR parameters for better recognition
    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6', // Assume uniform block of text
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?;:()[]{}"\'-/\\|@#$%^&*+=<>~` '
    });
    
    const results = [];
    
    for (let i = 0; i < imageObjects.length; i++) {
      const imageObj = imageObjects[i];
      const pageNum = imageObj.pageNumber;
      
      try {
        console.log(`Processing OCR for page ${pageNum}`);
        sendProgress(`Extracting text from page ${pageNum}...`);
        
        // Get the full path to the image file
        const imagePath = path.join(__dirname, 'uploads/images', `page_${pageNum}.png`);
        
        // Check if image file exists
        if (!await fs.pathExists(imagePath)) {
          console.log(`Image file not found for page ${pageNum}, skipping OCR`);
          results.push({
            pageNumber: pageNum,
            text: `[Page ${pageNum} - Image not available for OCR]`,
            confidence: 0
          });
          continue;
        }
        
        const { data: { text, confidence } } = await worker.recognize(imagePath);
        
        console.log(`Page ${pageNum} OCR completed with confidence: ${confidence}%`);
        sendProgress(`Page ${pageNum} text extracted (confidence: ${confidence.toFixed(1)}%)`);
        
        results.push({
          pageNumber: pageNum,
          text: text.trim(),
          confidence: confidence
        });
        
      } catch (error) {
        console.error(`OCR failed for page ${pageNum}:`, error);
        sendProgress(`OCR failed for page ${pageNum}: ${error.message}`);
        
        results.push({
          pageNumber: pageNum,
          text: `[OCR Error for page ${pageNum}: ${error.message}]`,
          confidence: 0
        });
      }
    }
    
    await worker.terminate();
    sendProgress('OCR processing completed.');
    
    return results;
  } catch (error) {
    console.error('Error in OCR processing:', error);
    sendProgress('Error in OCR processing: ' + error.message);
    throw error;
  }
}

// Translation function using OpenAI
async function translateText(text, sourceLanguage, sendProgress) {
  try {
    if (!text || text.trim() === '') {
      return { translatedText: '', confidence: 0 };
    }
    
    console.log('Starting translation for language:', sourceLanguage);
    sendProgress('Starting text translation...');
    
    let systemPrompt = '';
    if (sourceLanguage === 'hindi') {
      systemPrompt = 'You are a professional translator. Translate the following Hindi text to English. Maintain the original meaning and context. If the text contains Sanskrit words, translate them appropriately.';
    } else if (sourceLanguage === 'sanskrit') {
      systemPrompt = 'You are a professional Sanskrit translator. Translate the following Sanskrit text to English. Provide both literal and contextual translations where appropriate. Sanskrit is an ancient Indian language, so be careful with technical and religious terms.';
    } else {
      systemPrompt = 'You are a professional translator. Translate the following English text to Hindi. Maintain the original meaning and context.';
    }
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });
    
    const translatedText = completion.choices[0].message.content.trim();
    console.log('Translation completed');
    sendProgress('Translation completed successfully.');
    
    return { translatedText, confidence: 90 }; // OpenAI doesn't provide confidence scores
  } catch (error) {
    console.error('Translation error:', error);
    sendProgress('Translation error: ' + error.message);
    return { translatedText: `[Translation Error: ${error.message}]`, confidence: 0 };
  }
}

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

    console.log('Requested page ranges:', pageRanges);
    console.log('Parsed pages to process:', pagesToProcess);

    // Progress tracking function
    const progressUpdates = [];
    const sendProgress = (message) => {
      const timestamp = new Date().toLocaleTimeString();
      progressUpdates.push({ timestamp, message });
      console.log(`[${timestamp}] ${message}`);
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
    
    // Translate text if requested
    let translationResults = [];
    if (req.query.translate === 'true') {
      console.log('Starting translation...');
      sendProgress('Starting translation of extracted text...');
      
      for (const ocrResult of ocrResults) {
        if (ocrResult.text && ocrResult.text.trim() !== '') {
          const translation = await translateText(ocrResult.text, language, sendProgress);
          translationResults.push({
            pageNumber: ocrResult.pageNumber,
            originalText: ocrResult.text,
            translatedText: translation.translatedText,
            confidence: translation.confidence
          });
        }
      }
    }
    
    // Clean up the uploaded PDF file
    try {
      await fs.remove(pdfPath);
      console.log('Temporary PDF file cleaned up');
    } catch (cleanupError) {
      console.log('Could not clean up temporary PDF file:', cleanupError.message);
    }
    
    console.log('Processing completed successfully');
    sendProgress('All processing completed successfully!');
    
    res.json({
      success: true,
      images: imageObjects,
      ocrResults: ocrResults,
      translationResults: translationResults,
      progress: progressUpdates,
      message: `Successfully processed ${imageObjects.length} pages`
    });
    
  } catch (error) {
    console.error('Error processing upload:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      progress: progressUpdates || []
    });
  }
});

// Get images endpoint
app.get('/api/images', (req, res) => {
  try {
    const imagesDir = path.join(__dirname, 'uploads/images');
    const files = fs.readdirSync(imagesDir);
    const imageFiles = files.filter(file => file.endsWith('.png')).map(file => ({
      filename: file,
      path: `/uploads/images/${file}`
    }));
    res.json(imageFiles);
  } catch (error) {
    console.error('Error getting images:', error);
    res.status(500).json({ error: 'Failed to get images' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    canvas: !!createCanvas,
    openai: !!process.env.OPENAI_API_KEY
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Canvas available: ${!!createCanvas}`);
  console.log(`OpenAI API key configured: ${!!process.env.OPENAI_API_KEY}`);
}); 
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

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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'
});

console.log('Loaded OpenAI Key:', process.env.OPENAI_API_KEY);

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
         progressCallback(`Failed to convert page ${pageNum} to image`);
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
    progressCallback('All pages converted to images successfully.');
    
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
    });
    
    const results = [];
    
    for (let i = 0; i < imageObjects.length; i++) {
      const { imagePath, pageNumber } = imageObjects[i];
      const fullImagePath = path.join(__dirname, imagePath.replace('/uploads/', 'uploads/'));
      console.log('Processing OCR for image:', fullImagePath);
      sendProgress(`Extracting text from page ${pageNumber}...`);
      
      const { data: { text } } = await worker.recognize(fullImagePath);
      results.push({
        page: pageNumber,
        text: text.trim(),
        imagePath: imagePath
      });
      
      console.log(`OCR completed for page ${pageNumber}`);
      sendProgress(`Text extraction completed for page ${pageNumber}.`);
    }
    
    await worker.terminate();
    console.log('OCR processing completed');
    sendProgress(`OCR text extraction completed for all ${imageObjects.length} pages.`);
    
    return results;
  } catch (error) {
    console.error('Error in OCR processing:', error);
    sendProgress(`Error in OCR processing: ${error.message}`);
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
    
    // Translate text using GPT
    console.log('Starting translation processing...');
    sendProgress('Starting GPT translation for all pages...');
    const resultsWithTranslation = [];
    
    for (let i = 0; i < ocrResults.length; i++) {
      const page = ocrResults[i];
      sendProgress(`Translating page ${page.page}...`);
      const translation = await translateText(page.text, language, sendProgress);
      resultsWithTranslation.push({
        ...page,
        translation: translation
      });
      sendProgress(`Page ${page.page} translation completed.`);
    }
    
    // Clean up the uploaded PDF (no permanent storage)
    console.log('Cleaning up uploaded PDF...');
    sendProgress('Cleaning up temporary files...');
    await fs.remove(pdfPath);
    
    console.log('Upload, OCR, and translation successful, returning response');
    sendProgress('All processing completed successfully!');
    
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
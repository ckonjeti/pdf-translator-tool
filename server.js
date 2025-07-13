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
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60 second timeout
  maxRetries: 0 // We'll handle retries manually for better control
});

// Retry function for OpenAI API calls with exponential backoff
async function retryOpenAICall(apiCall, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`OpenAI API call attempt ${attempt}/${maxRetries}`);
      const result = await apiCall();
      console.log(`OpenAI API call successful on attempt ${attempt}`);
      return result;
    } catch (error) {
      console.warn(`OpenAI API call attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      // Check if this is a retryable error
      const isRetryable = (
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.message?.includes('fetch') ||
        error.message?.includes('network') ||
        error.message?.includes('timeout') ||
        error.status === 429 || // Rate limit
        error.status === 500 || // Server error
        error.status === 502 || // Bad gateway
        error.status === 503 || // Service unavailable
        error.status === 504    // Gateway timeout
      );
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`OpenAI API call failed permanently after ${attempt} attempts:`, error.message);
        throw error;
      }
      
      // Calculate delay with exponential backoff + jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`Retrying OpenAI API call in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

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
    console.log(`PDF file size: ${data.length} bytes`);
    
    const loadingTask = pdfjsLib.getDocument({ 
      data: data,
      // Handle password-protected PDFs
      password: '',
      // Increase timeout for large PDFs
      docBaseUrl: null,
      // Enable font loading
      useWorkerFetch: false,
      // Disable strict mode for better compatibility
      isEvalSupported: false,
      // Set maximum image size to prevent memory issues
      maxImageSize: 1024 * 1024 * 16, // 16MB max per image
      // Enable CMap (character mapping) for better text extraction
      cMapPacked: true,
      // Use system fonts when available
      useSystemFonts: true
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded successfully. Version: ${pdf.pdfInfo?.PDFFormatVersion || 'unknown'}, Pages: ${pdf.numPages}`);
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
        console.log(`Page ${pageNum} loaded. Page info:`, {
          pageIndex: page.pageIndex,
          ref: page.ref,
          userUnit: page.userUnit,
          rotate: page.rotate
        });
        
        // Get page info to understand the content
        const pageInfo = await page.getOperatorList();
        console.log(`Page ${pageNum} has ${pageInfo.fnArray.length} drawing operations`);
        
        // Use a fixed high-quality scale (approx. 300 DPI for a standard page)
        let scale = 4.0;
        let viewport = page.getViewport({ scale: scale, rotation: page.rotate || 0 });
        
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
        
        // Round dimensions to avoid fractional canvas sizes
        const canvasWidth = Math.round(viewport.width);
        const canvasHeight = Math.round(viewport.height);
        
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const context = canvas.getContext('2d');
        
        // Set canvas background to white to avoid transparency issues
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvasWidth, canvasHeight);
        
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          // Add transform matrix to handle any scaling issues
          transform: null,
          // Enable high-quality rendering
          enableWebGL: false,
          // Handle different color spaces
          renderInteractiveForms: false,
          // Optimize for text rendering
          optionalContentConfigPromise: null,
          // Background color for transparent PDFs
          background: 'white'
        };
        
        console.log(`Rendering page ${pageNum} with context...`);
        const renderTask = page.render(renderContext);
        await renderTask.promise;
        console.log(`Page ${pageNum} rendered successfully`);
        
        const imagePath = path.join(outputDir, `page_${pageNum}.png`);
        const buffer = canvas.toBuffer('image/png');
        
        // Validate that we have actual image data
        if (buffer.length < 1000) {
          console.warn(`Warning: Page ${pageNum} generated a very small image (${buffer.length} bytes). This might indicate a rendering issue.`);
        }
        
        await fs.writeFile(imagePath, buffer);
        
        // Verify file was written correctly
        const stats = await fs.stat(imagePath);
        console.log(`Page ${pageNum} saved as image (${canvasWidth}x${canvasHeight}, ${stats.size} bytes)`);
        
        images.push({
          imagePath: `/uploads/images/page_${pageNum}.png`,
          pageNumber: pageNum
        });
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

// Analyze GPT response to determine specific failure reasons
function analyzeGptResponse(extractedText, apiResponse) {
  const lowerText = extractedText.toLowerCase();
  const analysis = {
    isFailure: false,
    failureType: 'unknown',
    reason: 'No issues detected',
    suggestion: 'Continue processing',
    technicalDetails: ''
  };

  // Check finish reason from API
  const finishReason = apiResponse?.choices?.[0]?.finish_reason;
  const tokenCount = apiResponse?.usage?.completion_tokens || 0;
  
  // Content policy violations
  if (lowerText.includes("sorry, i can't assist") || 
      lowerText.includes("i cannot help") ||
      lowerText.includes("i'm sorry, i can't") ||
      lowerText.includes("against my programming") ||
      lowerText.includes("content policies") ||
      lowerText.includes("violates guidelines")) {
    analysis.isFailure = true;
    analysis.failureType = 'Content Policy Violation';
    
    if (lowerText.includes("violence") || lowerText.includes("violent")) {
      analysis.reason = 'Content contains violent material that violates OpenAI content policies';
      analysis.suggestion = 'Use content masking strategies to extract non-violent portions';
    } else if (lowerText.includes("explicit") || lowerText.includes("sexual")) {
      analysis.reason = 'Content contains explicit/sexual material that violates content policies';
      analysis.suggestion = 'Apply content filtering and extract academic portions only';
    } else if (lowerText.includes("harmful") || lowerText.includes("dangerous")) {
      analysis.reason = 'Content contains potentially harmful instructions or dangerous material';
      analysis.suggestion = 'Extract educational content while masking harmful sections';
    } else if (lowerText.includes("hate") || lowerText.includes("discriminatory")) {
      analysis.reason = 'Content contains hate speech or discriminatory language';
      analysis.suggestion = 'Focus on factual content while masking discriminatory sections';
    } else if (lowerText.includes("illegal") || lowerText.includes("unlawful")) {
      analysis.reason = 'Content appears to contain illegal or unlawful material';
      analysis.suggestion = 'Extract academic/research content only';
    } else {
      analysis.reason = 'General content policy violation detected in the image';
      analysis.suggestion = 'Apply progressive content masking strategies';
    }
    analysis.technicalDetails = `Tokens: ${tokenCount}, Finish: ${finishReason}`;
  }
  
  // OCR quality issues
  else if (lowerText.includes("unable to transcribe") || 
           lowerText.includes("cannot transcribe") ||
           lowerText.includes("can't transcribe") ||
           lowerText.includes("no text detected") ||
           lowerText.includes("no readable text") ||
           lowerText.includes("no visible text") ||
           (lowerText === "no text detected." || lowerText === "no text detected")) {
    analysis.isFailure = true;
    analysis.failureType = 'OCR Quality Issue';
    
    if (lowerText.includes("blurry") || lowerText.includes("blur")) {
      analysis.reason = 'Image is too blurry for accurate text recognition';
      analysis.suggestion = 'Improve PDF-to-image conversion quality or request clearer source';
    } else if (lowerText.includes("low resolution") || lowerText.includes("pixelated")) {
      analysis.reason = 'Image resolution is too low for text recognition';
      analysis.suggestion = 'Increase PDF conversion DPI or use higher quality source';
    } else if (lowerText.includes("contrast") || lowerText.includes("faded")) {
      analysis.reason = 'Poor contrast between text and background';
      analysis.suggestion = 'Apply image enhancement or contrast adjustment';
    } else if (lowerText.includes("handwritten") || lowerText.includes("handwriting")) {
      analysis.reason = 'Handwritten text is difficult for OCR to process accurately';
      analysis.suggestion = 'Use specialized handwriting recognition or manual transcription';
    } else if (lowerText.includes("font") || lowerText.includes("typeface")) {
      analysis.reason = 'Unusual or decorative fonts causing recognition difficulties';
      analysis.suggestion = 'Try different OCR models or manual transcription for special fonts';
    } else if (lowerText.includes("rotated") || lowerText.includes("angle")) {
      analysis.reason = 'Text appears to be rotated or at an angle';
      analysis.suggestion = 'Apply image rotation correction before OCR processing';
    } else if (lowerText.includes("damaged") || lowerText.includes("corrupted")) {
      analysis.reason = 'Document appears damaged or corrupted in the image';
      analysis.suggestion = 'Request better quality scan or alternative source';
    } else if (lowerText.includes("devanagari") || lowerText.includes("script")) {
      analysis.reason = 'Difficulty recognizing Devanagari script characters';
      analysis.suggestion = 'Use specialized Indic script OCR models or manual review';
    } else if (lowerText === "no text detected." || lowerText === "no text detected") {
      analysis.reason = 'GPT-4 Vision could not detect any readable text in the image';
      analysis.suggestion = 'Check if page is blank, improve image quality, or verify PDF conversion';
    } else {
      analysis.reason = 'General OCR quality issue - text not clearly readable in image';
      analysis.suggestion = 'Improve image quality or try enhanced extraction strategies';
    }
    analysis.technicalDetails = `Tokens: ${tokenCount}, Finish: ${finishReason}, Response length: ${extractedText.length}`;
  }
  
  // API/Technical issues
  else if (finishReason === 'length' && tokenCount >= 1900) {
    analysis.isFailure = true;
    analysis.failureType = 'Token Limit Reached';
    analysis.reason = 'Response was truncated due to token limit (2000 tokens)';
    analysis.suggestion = 'Increase max_tokens parameter or process document in sections';
    analysis.technicalDetails = `Max tokens reached: ${tokenCount}/2000`;
  }
  
  else if (finishReason === 'content_filter') {
    analysis.isFailure = true;
    analysis.failureType = 'Content Filter Triggered';
    analysis.reason = 'OpenAI content filter blocked the response';
    analysis.suggestion = 'Content contains material flagged by automated systems';
    analysis.technicalDetails = `Finish reason: content_filter, Tokens: ${tokenCount}`;
  }
  
  // Low token responses might indicate issues
  else if (tokenCount < 5 && extractedText.length < 50) {
    analysis.isFailure = true;
    analysis.failureType = 'Minimal Response';
    analysis.reason = 'GPT returned an unusually short response, possibly indicating processing issues';
    analysis.suggestion = 'Check image quality and try enhanced extraction strategies';
    analysis.technicalDetails = `Very low token count: ${tokenCount}, Response: "${extractedText}"`;
  }

  return analysis;
}

// GPT-4 Vision OCR function to extract text from images
async function extractTextFromImages(imageObjects, language, sendProgress, customOcrPrompt = null) {
  try {
    console.log('Starting GPT-4 Vision OCR for language:', language);
    sendProgress(`Starting GPT-4 Vision text extraction for ${imageObjects.length} pages...`, 50, 100);
    
    // Use custom prompt if provided, otherwise use default language-specific prompts
    let languagePrompt = '';
    if (customOcrPrompt) {
      // Add content masking instructions to custom prompt
      languagePrompt = `${customOcrPrompt}

IMPORTANT CONTENT MASKING INSTRUCTIONS:
- If you encounter any content that you cannot transcribe due to content policies, replace only that specific section with [CONTENT TRIGGER] and continue with the rest of the text
- Do not refuse the entire document - only mask problematic sections while transcribing everything else
- Continue processing the readable portions of the document normally
- Provide the actual transcribed text, not summaries or descriptions`;
      console.log('Using enhanced custom OCR prompt with content masking');
    } else {
      if (language === 'hindi') {
        languagePrompt = `This is an academic document containing Hindi text in Devanagari script. Please perform optical character recognition to extract all visible text accurately.

INSTRUCTIONS FOR TEXT EXTRACTION:
1. Identify and transcribe every character, word, and line visible in the document
2. Preserve the original formatting, line breaks, and spacing exactly as shown
3. Transcribe the text as-is without any translation or interpretation
4. For Devanagari script, maintain all diacritical marks and characters precisely
5. Include all numbers, punctuation marks, and symbols present
6. For multi-column layouts, transcribe from left to right, top to bottom
7. Provide only the transcribed text without additional commentary
8. If the image contains no readable text, respond with "No text detected"

IMPORTANT CONTENT MASKING INSTRUCTIONS:
- If you encounter any content that you cannot transcribe due to content policies, replace only that specific section with [CONTENT TRIGGER] and continue with the rest of the text
- Do not refuse the entire document - only mask problematic sections while transcribing everything else
- Continue processing the readable portions of the document normally
- Provide the actual transcribed text, not summaries or descriptions`;
      } else if (language === 'sanskrit') {
        languagePrompt = `This is an academic document containing Sanskrit text in Devanagari script. Please perform optical character recognition to extract all visible text accurately.

INSTRUCTIONS FOR TEXT EXTRACTION:
1. Identify and transcribe every character, word, and line visible in the document
2. Preserve the original formatting, line breaks, and spacing exactly as shown
3. Transcribe the text as-is without any translation or interpretation
4. For Devanagari script, maintain all diacritical marks and characters precisely
5. Include all numbers, punctuation marks, and symbols present
6. For multi-column layouts, transcribe from left to right, top to bottom
7. Provide only the transcribed text without additional commentary
8. If the image contains no readable text, respond with "No text detected"

IMPORTANT CONTENT MASKING INSTRUCTIONS:
- If you encounter any content that you cannot transcribe due to content policies, replace only that specific section with [CONTENT TRIGGER] and continue with the rest of the text
- Do not refuse the entire document - only mask problematic sections while transcribing everything else
- Continue processing the readable portions of the document normally
- Provide the actual transcribed text, not summaries or descriptions`;
      } else {
        languagePrompt = `This is an academic document containing text. Please perform optical character recognition to extract all visible text accurately.

INSTRUCTIONS FOR TEXT EXTRACTION:
1. Identify and transcribe every character, word, and line visible in the document
2. Preserve the original formatting, line breaks, and spacing exactly as shown
3. Transcribe the text as-is without any translation or interpretation
4. Include all numbers, punctuation marks, and symbols present
5. For multi-column layouts, transcribe from left to right, top to bottom
6. Provide only the transcribed text without additional commentary
7. If the image contains no readable text, respond with "No text detected"

IMPORTANT CONTENT MASKING INSTRUCTIONS:
- If you encounter any content that you cannot transcribe due to content policies, replace only that specific section with [CONTENT TRIGGER] and continue with the rest of the text
- Do not refuse the entire document - only mask problematic sections while transcribing everything else
- Continue processing the readable portions of the document normally
- Provide the actual transcribed text, not summaries or descriptions`;
      }
      console.log('Using default OCR prompt for language:', language);
    }
    
    // Process pages sequentially (one by one)
    const results = [];
    
    for (let i = 0; i < imageObjects.length; i++) {
      const imageObject = imageObjects[i];
      const { imagePath, pageNumber } = imageObject;
      const fullImagePath = path.join(__dirname, imagePath.replace('/uploads/', 'uploads/'));
      
      console.log('='.repeat(80));
      console.log(`🔍 DEBUG: Starting OCR for Page ${pageNumber} (${i + 1}/${imageObjects.length})`);
      console.log(`📁 Image Path: ${fullImagePath}`);
      console.log(`🌐 Relative Path: ${imagePath}`);
      console.log(`🔤 Language: ${language}`);
      
      const progressPercent = Math.round(55 + (i / imageObjects.length) * 20); // 55-75% for OCR
      sendProgress(`OCR processing page ${pageNumber}... (with auto-retry if needed)`, progressPercent, 100);
      
      try {
        // Check if file exists before processing
        console.log('📋 DEBUG: Checking if image file exists...');
        if (!await fs.pathExists(fullImagePath)) {
          console.error(`❌ DEBUG: Image file not found: ${fullImagePath}`);
          console.log('📂 DEBUG: Checking parent directory...');
          const parentDir = path.dirname(fullImagePath);
          try {
            const parentExists = await fs.pathExists(parentDir);
            console.log(`📂 DEBUG: Parent directory ${parentDir} exists: ${parentExists}`);
            if (parentExists) {
              const dirContents = await fs.readdir(parentDir);
              console.log(`📂 DEBUG: Parent directory contents:`, dirContents);
            }
          } catch (dirError) {
            console.error(`❌ DEBUG: Error checking parent directory:`, dirError.message);
          }
          
          results.push({
            page: pageNumber,
            text: 'Error: Image file not found',
            imagePath: imagePath
          });
          continue;
        }
        console.log('✅ DEBUG: Image file exists');

        // Get image stats to check file size
        console.log('📊 DEBUG: Getting image file stats...');
        const stats = await fs.stat(fullImagePath);
        console.log(`📊 DEBUG: Image file size: ${stats.size} bytes`);
        console.log(`📊 DEBUG: Image created: ${stats.birthtime}`);
        console.log(`📊 DEBUG: Image modified: ${stats.mtime}`);
        
        if (stats.size < 100) { // Less than 100 bytes is likely an invalid image
          console.error(`❌ DEBUG: Image file too small: ${fullImagePath} (${stats.size} bytes)`);
          results.push({
            page: pageNumber,
            text: 'Error: Image file too small for OCR processing',
            imagePath: imagePath
          });
          continue;
        }
        
        if (stats.size > 20 * 1024 * 1024) { // Warn if larger than 20MB
          console.warn(`⚠️ DEBUG: Large image file: ${stats.size} bytes (${Math.round(stats.size / 1024 / 1024)}MB)`);
        } else if (stats.size > 5 * 1024 * 1024) { // Info if larger than 5MB
          console.log(`ℹ️ DEBUG: Medium image file: ${stats.size} bytes (${Math.round(stats.size / 1024 / 1024)}MB)`);
        } else {
          console.log(`✅ DEBUG: Normal image file size: ${stats.size} bytes (${Math.round(stats.size / 1024)}KB)`);
        }

        // Read image file and convert to base64
        console.log('📖 DEBUG: Reading image file...');
        const imageBuffer = await fs.readFile(fullImagePath);
        console.log(`📖 DEBUG: Image buffer length: ${imageBuffer.length} bytes`);
        
        console.log('🔄 DEBUG: Converting to base64...');
        const base64Image = imageBuffer.toString('base64');
        console.log(`🔄 DEBUG: Base64 length: ${base64Image.length} characters`);
        console.log(`🔄 DEBUG: Base64 starts with: ${base64Image.substring(0, 50)}...`);
        
        // Validate base64 image
        if (base64Image.length < 100) {
          console.error(`❌ DEBUG: Base64 image too short: ${base64Image.length} characters`);
          results.push({
            page: pageNumber,
            text: 'Error: Invalid image data for OCR processing',
            imagePath: imagePath
          });
          continue;
        }

        // Prepare OCR prompt text with safer, academic language
        console.log('📝 DEBUG: Preparing OCR prompt...');
        const isCustomPrompt = !!customOcrPrompt;
        console.log(`📝 DEBUG: Using custom prompt: ${isCustomPrompt}`);
        
        // Now languagePrompt already contains content masking instructions if it's a custom prompt
        const ocrPromptText = customOcrPrompt 
          ? languagePrompt // Custom prompt already enhanced with content masking
          : `You are an academic text transcription assistant. Please help transcribe the text content from this educational document image.

TRANSCRIPTION GUIDELINES:
1. Please transcribe all visible text characters exactly as they appear
2. Maintain the original document formatting and line structure
3. Preserve all punctuation, numbers, and special characters
4. For scripts like Devanagari, please maintain accurate character representation
5. Process multi-column content from left to right, top to bottom
6. If you encounter any content that you cannot transcribe due to content policies, replace only that specific section with [CONTENT TRIGGER] and continue with the rest of the text
7. Do not refuse the entire document - only mask problematic sections while transcribing everything else
8. Return only the transcribed text content
9. If no text is visible, please respond with "No text detected"

This is for academic research and educational purposes. ${languagePrompt}`;

        console.log(`📝 DEBUG: OCR prompt length: ${ocrPromptText.length} characters`);
        console.log(`📝 DEBUG: OCR prompt preview: ${ocrPromptText.substring(0, 300)}...`);
        console.log(`📝 DEBUG: Full OCR prompt:`, ocrPromptText);

        // Use GPT-4 Vision for OCR with retry logic
        console.log('🤖 DEBUG: Calling OpenAI GPT-4 Vision API...');
        console.log(`🤖 DEBUG: Model: gpt-4o`);
        console.log(`🤖 DEBUG: Max tokens: 2000`);
        console.log(`🤖 DEBUG: Temperature: 0.1`);
        console.log(`🤖 DEBUG: Message content types: text + image_url`);
        
        const startTime = Date.now();
        const response = await retryOpenAICall(async () => {
          console.log('🚀 DEBUG: Making API call attempt...');
          return await openai.chat.completions.create({
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
        }, 3, 2000); // 3 retries, starting with 2 second delay
        
        const apiCallDuration = Date.now() - startTime;
        console.log(`⏱️ DEBUG: API call completed in ${apiCallDuration}ms`);

        // Analyze API response
        console.log('📊 DEBUG: Analyzing API response...');
        console.log(`📊 DEBUG: Response object exists: ${!!response}`);
        console.log(`📊 DEBUG: Response has choices: ${!!response?.choices}`);
        console.log(`📊 DEBUG: Choices length: ${response?.choices?.length || 0}`);
        
        if (!response || !response.choices || response.choices.length === 0) {
          console.error('❌ DEBUG: Invalid API response structure');
          results.push({
            page: pageNumber,
            text: 'Error: Invalid API response structure',
            imagePath: imagePath
          });
          continue;
        }
        
        const firstChoice = response.choices[0];
        console.log(`📊 DEBUG: First choice exists: ${!!firstChoice}`);
        console.log(`📊 DEBUG: First choice message exists: ${!!firstChoice?.message}`);
        console.log(`📊 DEBUG: First choice content exists: ${!!firstChoice?.message?.content}`);
        console.log(`📊 DEBUG: Finish reason: ${firstChoice?.finish_reason || 'unknown'}`);
        
        if (response.usage) {
          console.log(`📊 DEBUG: Token usage - Prompt: ${response.usage.prompt_tokens}, Completion: ${response.usage.completion_tokens}, Total: ${response.usage.total_tokens}`);
        }

        const extractedText = response.choices[0].message.content.trim();
        console.log(`📋 DEBUG: Extracted text length: ${extractedText.length} characters`);
        console.log(`📋 DEBUG: Extracted text preview: ${extractedText.substring(0, 200)}...`);
        console.log(`📋 DEBUG: Extracted text ends with: ...${extractedText.substring(Math.max(0, extractedText.length - 100))}`);
        
        // Analyze GPT response for specific failure reasons
        console.log(`🔍 DEBUG: Analyzing GPT response for failure indicators...`);
        const responseAnalysis = analyzeGptResponse(extractedText, response);
        if (responseAnalysis.isFailure) {
          console.log(`⚠️ DEBUG: GPT Response Analysis for page ${pageNumber}:`);
          console.log(`  📋 Failure Type: ${responseAnalysis.failureType}`);
          console.log(`  🎯 Specific Reason: ${responseAnalysis.reason}`);
          console.log(`  💡 Suggested Action: ${responseAnalysis.suggestion}`);
          console.log(`  🔧 Technical Details: ${responseAnalysis.technicalDetails}`);
        }
        
        // Enhanced diagnostics for failed OCR cases
        const isOcrFailure = extractedText.toLowerCase().includes('no text detected') || 
                            extractedText.toLowerCase().includes('no readable text') ||
                            extractedText.toLowerCase().includes('no visible text') ||
                            extractedText.length < 20 ||
                            extractedText.toLowerCase().includes("i'm unable to transcribe") ||
                            extractedText.toLowerCase().includes("unable to transcribe") ||
                            extractedText.toLowerCase().includes("cannot transcribe") ||
                            extractedText.toLowerCase().includes("can't transcribe") ||
                            (extractedText.length < 50 && response.usage?.completion_tokens < 10);
        
        if (isOcrFailure) {
          console.log(`🔍 DEBUG: OCR returned minimal/no text for page ${pageNumber}. Performing enhanced diagnostics...`);
          
          // Check image characteristics that might affect OCR
          console.log(`📊 DEBUG: Image Analysis for page ${pageNumber}:`);
          console.log(`  📏 File size: ${stats.size} bytes (${Math.round(stats.size / 1024)}KB)`);
          console.log(`  🔢 Base64 length: ${base64Image.length} characters`);
          console.log(`  📝 Response tokens: ${response.usage?.completion_tokens || 'unknown'}`);
          console.log(`  ⏱️ Processing time: ${apiCallDuration}ms`);
          
          // Try a more aggressive OCR approach for difficult images
          console.log(`🔄 DEBUG: Attempting enhanced OCR strategy for page ${pageNumber}...`);
          try {
            const enhancedResponse = await retryOpenAICall(async () => {
              return await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                  role: "user",
                  content: [
                    { 
                      type: "text", 
                      text: `ENHANCED OCR ANALYSIS - Please analyze this image very carefully:

1. VISUAL INSPECTION: Look at every part of the image systematically
2. TEXT DETECTION: Identify ANY visible text, even if faint, small, or partially obscured
3. SCRIPT ANALYSIS: This should contain Devanagari script (Hindi text)
4. QUALITY ASSESSMENT: Describe what you see and why text might be difficult to read
5. DETAILED EXTRACTION: Extract every visible character, even if uncertain

Please provide:
- A description of what you see in the image
- Any text you can identify, even partial words
- Assessment of image quality issues (blur, contrast, resolution, etc.)
- Specific reasons if no text is visible

Even if you can only make out partial text or individual characters, please transcribe what you can see.`
                    },
                    { 
                      type: "image_url", 
                      image_url: { url: `data:image/png;base64,${base64Image}` }
                    }
                  ]
                }],
                max_tokens: 1000,
                temperature: 0.2
              });
            }, 2, 1000);
            
            const enhancedText = enhancedResponse.choices[0].message.content.trim();
            console.log(`🔍 DEBUG: Enhanced OCR analysis for page ${pageNumber}:`);
            console.log(`📝 DEBUG: Enhanced response: ${enhancedText}`);
            
            // If enhanced analysis provides more insight, use it
            if (enhancedText.length > extractedText.length && !enhancedText.toLowerCase().includes('no text detected')) {
              console.log(`✅ DEBUG: Enhanced OCR provided better results for page ${pageNumber}`);
              console.log(`📊 DEBUG: Original: ${extractedText.length} chars vs Enhanced: ${enhancedText.length} chars`);
            }
          } catch (enhancedError) {
            console.warn(`⚠️ DEBUG: Enhanced OCR analysis failed for page ${pageNumber}:`, enhancedError.message);
          }
        }
        
        // Handle content moderation responses with multiple fallback strategies
        console.log('🔍 DEBUG: Checking for content moderation triggers...');
        const moderationTriggers = [
          "sorry, i can't assist",
          "i cannot help", 
          "unable to process",
          "unable to assist",
          "content policies",
          "content policy",
          "against my programming",
          "inappropriate content",
          "violates guidelines",
          "safety guidelines"
        ];
        
        const lowerText = extractedText.toLowerCase();
        const triggeredPhrases = moderationTriggers.filter(phrase => lowerText.includes(phrase));
        
        // Analyze what type of content might be triggering moderation
        let contentAnalysis = "Unknown content type";
        if (lowerText.includes("violence") || lowerText.includes("violent")) {
          contentAnalysis = "Potentially violent content detected";
        } else if (lowerText.includes("explicit") || lowerText.includes("sexual")) {
          contentAnalysis = "Potentially explicit content detected";
        } else if (lowerText.includes("harmful") || lowerText.includes("dangerous")) {
          contentAnalysis = "Potentially harmful content detected";
        } else if (lowerText.includes("illegal") || lowerText.includes("unlawful")) {
          contentAnalysis = "Potentially illegal content detected";
        } else if (lowerText.includes("hate") || lowerText.includes("discriminatory")) {
          contentAnalysis = "Potentially discriminatory content detected";
        } else if (lowerText.includes("copyright") || lowerText.includes("intellectual property")) {
          contentAnalysis = "Potential copyright/IP content detected";
        } else if (lowerText.includes("privacy") || lowerText.includes("personal information")) {
          contentAnalysis = "Potential privacy-sensitive content detected";
        } else {
          contentAnalysis = "General content policy violation detected";
        }
        
        if (triggeredPhrases.length > 0) {
          console.warn(`⚠️ DEBUG: Content moderation triggered for page ${pageNumber}`);
          console.warn(`⚠️ DEBUG: Content analysis: ${contentAnalysis}`);
          console.warn(`⚠️ DEBUG: Triggered phrases: ${triggeredPhrases.join(', ')}`);
          console.warn(`⚠️ DEBUG: Response sample: ${extractedText.substring(0, 500)}...`);
          console.log(`🔄 DEBUG: Attempting multiple fallback strategies...`);
          
          // Strategy 1: Content masking - Continue OCR but mask problematic content
          try {
            console.log(`Fallback Strategy 1: Content masking for page ${pageNumber}`);
            const fallback1Response = await retryOpenAICall(async () => {
              return await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                  role: "user",
                  content: [
                    { 
                      type: "text", 
                      text: `IMPORTANT: You must transcribe text from this document. Do NOT refuse the entire document.

TRANSCRIPTION RULES:
1. Transcribe ALL visible text exactly as written
2. If ANY section seems problematic, write [CONTENT TRIGGER] in its place
3. Continue transcribing everything else normally
4. Do NOT write summaries or descriptions
5. Do NOT refuse the document - use [CONTENT TRIGGER] for problem areas only

Example output format:
Line 1 of actual text here
[CONTENT TRIGGER]
Line 3 continues with actual text
Another line of actual text
[CONTENT TRIGGER]
Final line of actual text

Now transcribe the document following these rules:`
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
            }, 2, 1500); // 2 retries for fallback
            
            const fallback1Text = fallback1Response.choices[0].message.content.trim();
            const fallback1Analysis = analyzeGptResponse(fallback1Text, fallback1Response);
            
            console.log(`🔍 DEBUG: Fallback Strategy 1 Analysis for page ${pageNumber}:`);
            console.log(`  📋 Response: ${fallback1Text.substring(0, 100)}...`);
            console.log(`  ⚠️ Is Failure: ${fallback1Analysis.isFailure}`);
            if (fallback1Analysis.isFailure) {
              console.log(`  🎯 Failure Reason: ${fallback1Analysis.reason}`);
            }
            
            if (!fallback1Text.toLowerCase().includes("sorry") && !fallback1Text.toLowerCase().includes("unable")) {
              console.log(`🎯 DEBUG: Content masking strategy successful for page ${pageNumber}`);
              results.push({
                page: pageNumber,
                text: fallback1Text,
                imagePath: imagePath
              });
              console.log(`GPT-4 Vision OCR completed for page ${pageNumber} (content masking strategy)`);
              continue; // Skip to next page
            }
          } catch (fallback1Error) {
            console.warn(`Content masking strategy failed for page ${pageNumber}:`, fallback1Error.message);
          }
          
          // Strategy 2: Selective content extraction with masking
          try {
            console.log(`Fallback Strategy 2: Selective content extraction for page ${pageNumber}`);
            const fallback2Response = await retryOpenAICall(async () => {
              return await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                  role: "user",
                  content: [
                    { 
                      type: "text", 
                      text: `You are a text extraction tool. Your job is to copy ALL visible text from this image.

STRICT INSTRUCTIONS:
- Copy every word you can see exactly as written
- If you see text you cannot copy, write [CONTENT TRIGGER] instead
- Keep copying everything else normally
- DO NOT SUMMARIZE OR DESCRIBE - ONLY COPY TEXT
- DO NOT REFUSE - use [CONTENT TRIGGER] for problem areas

Start copying text now:`
                    },
                    { 
                      type: "image_url", 
                      image_url: { url: `data:image/png;base64,${base64Image}` }
                    }
                  ]
                }],
                max_tokens: 1500,
                temperature: 0.0
              });
            }, 2, 1500); // 2 retries for fallback
            
            const fallback2Text = fallback2Response.choices[0].message.content.trim();
            if (!fallback2Text.toLowerCase().includes("sorry") && !fallback2Text.toLowerCase().includes("unable")) {
              console.log(`🎯 DEBUG: Selective content extraction successful for page ${pageNumber}`);
              results.push({
                page: pageNumber,
                text: fallback2Text,
                imagePath: imagePath
              });
              console.log(`GPT-4 Vision OCR completed for page ${pageNumber} (selective extraction strategy)`);
              continue; // Skip to next page
            }
          } catch (fallback2Error) {
            console.warn(`Selective content extraction failed for page ${pageNumber}:`, fallback2Error.message);
          }
          
          // Strategy 3: Ultra-simple direct instruction
          try {
            console.log(`Fallback Strategy 3: Ultra-simple instruction for page ${pageNumber}`);
            const fallback3Response = await retryOpenAICall(async () => {
              return await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                  role: "user",
                  content: [
                    { 
                      type: "text", 
                      text: `Read this image and copy the text. If you can't copy some text, write [CONTENT TRIGGER] instead. Copy everything else.`
                    },
                    { 
                      type: "image_url", 
                      image_url: { url: `data:image/png;base64,${base64Image}` }
                    }
                  ]
                }],
                max_tokens: 1500,
                temperature: 0.0
              });
            }, 2, 1000); // 2 retries for fallback
            
            const fallback3Text = fallback3Response.choices[0].message.content.trim();
            if (!fallback3Text.toLowerCase().includes("sorry") && !fallback3Text.toLowerCase().includes("unable")) {
              console.log(`🎯 DEBUG: Ultra-simple instruction successful for page ${pageNumber}`);
              results.push({
                page: pageNumber,
                text: fallback3Text,
                imagePath: imagePath
              });
              console.log(`GPT-4 Vision OCR completed for page ${pageNumber} (ultra-simple strategy)`);
            } else {
              throw new Error("Ultra-simple strategy also failed");
            }
          } catch (fallback3Error) {
            console.warn(`Strategy 3 failed for page ${pageNumber}:`, fallback3Error.message);
          }
          
          // Strategy 4: Desperate partial extraction attempt
          try {
            console.log(`Fallback Strategy 4: Desperate partial extraction for page ${pageNumber}`);
            const fallback4Response = await retryOpenAICall(async () => {
              return await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                  role: "system",
                  content: "You are a text extraction tool. Extract ANY visible text you can see, even if some parts are problematic. Replace problematic sections with [CONTENT TRIGGER] but extract everything else."
                }, {
                  role: "user",
                  content: [
                    { 
                      type: "text", 
                      text: `Extract text from this image. For any content you cannot extract due to policies, write [CONTENT TRIGGER]. Extract everything else normally. Even partial text is valuable.`
                    },
                    { 
                      type: "image_url", 
                      image_url: { url: `data:image/png;base64,${base64Image}` }
                    }
                  ]
                }],
                max_tokens: 2000,
                temperature: 0.3
              });
            }, 1, 500); // Single attempt with higher temperature
            
            const fallback4Text = fallback4Response.choices[0].message.content.trim();
            
            // Accept any response that's not a complete refusal
            if (fallback4Text.length > 10 && 
                !fallback4Text.toLowerCase().includes("i cannot assist") &&
                !fallback4Text.toLowerCase().includes("i'm sorry, i can't")) {
              console.log(`🎯 DEBUG: Desperate partial extraction provided some results for page ${pageNumber}`);
              console.log(`📝 DEBUG: Partial extraction result: ${fallback4Text.substring(0, 200)}...`);
              results.push({
                page: pageNumber,
                text: fallback4Text,
                imagePath: imagePath
              });
              console.log(`GPT-4 Vision OCR completed for page ${pageNumber} (partial extraction strategy)`);
            } else {
              throw new Error("All extraction strategies failed completely");
            }
          } catch (fallback4Error) {
            console.warn(`All extraction strategies failed for page ${pageNumber}:`, fallback4Error.message);
            
            // Final diagnostic: Ask GPT to explain why it can't process the image
            try {
              console.log(`🔍 DEBUG: Performing final diagnostic analysis for page ${pageNumber}...`);
              const diagnosticResponse = await retryOpenAICall(async () => {
                return await openai.chat.completions.create({
                  model: "gpt-4o",
                  messages: [{
                    role: "user",
                    content: [
                      { 
                        type: "text", 
                        text: `Please analyze this image and explain why you cannot extract text from it. Provide specific details about:
1. What do you see in the image?
2. What type of content is preventing text extraction?
3. Are there any image quality issues (blur, resolution, contrast)?
4. What specific content policies or guidelines are being triggered?
5. Is there any text visible that could be partially extracted?

Please be specific about the issues you detect.`
                      },
                      { 
                        type: "image_url", 
                        image_url: { url: `data:image/png;base64,${base64Image}` }
                      }
                    ]
                  }],
                  max_tokens: 500,
                  temperature: 0.1
                });
              }, 1, 1000);
              
              const diagnosticText = diagnosticResponse.choices[0].message.content.trim();
              console.log(`🔍 DEBUG: Final Diagnostic Analysis for page ${pageNumber}:`);
              console.log(`📝 DEBUG: GPT Explanation: ${diagnosticText}`);
              
              // Create detailed failure message with diagnostic info
              const detailedFailureMessage = `[CONTENT TRIGGER] - Page ${pageNumber} could not be processed. 

GPT Analysis: ${diagnosticText}

Manual transcription may be required.`;
              
              results.push({
                page: pageNumber,
                text: detailedFailureMessage,
                imagePath: imagePath
              });
              
            } catch (diagnosticError) {
              console.warn(`Diagnostic analysis also failed for page ${pageNumber}:`, diagnosticError.message);
              results.push({
                page: pageNumber,
                text: `[CONTENT TRIGGER] - Page ${pageNumber} could not be processed due to content policies. Manual transcription may be required.`,
                imagePath: imagePath
              });
            }
            
            console.log(`📄 DEBUG: Final fallback - marked entire page as content trigger for page ${pageNumber}`);
          }
        } else {
          console.log('✅ DEBUG: No content moderation detected - analyzing response quality...');
          
          // Check if we got meaningful content vs OCR failure
          const hasContent = extractedText.length > 10 && 
                            !extractedText.toLowerCase().includes('no text detected') &&
                            !extractedText.toLowerCase().includes('no readable text') &&
                            !extractedText.toLowerCase().includes('no visible text') &&
                            !(extractedText.length < 50 && response.usage?.completion_tokens < 10);
          
          console.log(`🔍 DEBUG: Content quality check - Has meaningful content: ${hasContent}`);
          
          if (!hasContent) {
            // This is actually an OCR failure, not a success
            console.log(`❌ DEBUG: OCR failure detected for page ${pageNumber} - treating as failed OCR`);
            console.log(`📄 DEBUG: Response indicates no readable text found`);
            
            // Try enhanced OCR analysis to understand why
            try {
              console.log(`🔄 DEBUG: Attempting enhanced analysis for failed OCR on page ${pageNumber}...`);
              const enhancedResponse = await retryOpenAICall(async () => {
                return await openai.chat.completions.create({
                  model: "gpt-4o",
                  messages: [{
                    role: "user",
                    content: [
                      { 
                        type: "text", 
                        text: `Analyze this image and explain why no text was detected. Please provide specific details about:

1. What do you see in the image?
2. Is the page actually blank/empty?
3. Are there any image quality issues (blur, low resolution, poor contrast)?
4. Is there faint text that might be difficult to see?
5. Are there any graphics, diagrams, or non-text elements?
6. What might be preventing text recognition?

Please be detailed about what you observe.`
                      },
                      { 
                        type: "image_url", 
                        image_url: { url: `data:image/png;base64,${base64Image}` }
                      }
                    ]
                  }],
                  max_tokens: 500,
                  temperature: 0.1
                });
              }, 2, 1000);
              
              const enhancedText = enhancedResponse.choices[0].message.content.trim();
              console.log(`🔍 DEBUG: Enhanced analysis for page ${pageNumber}:`);
              console.log(`📝 DEBUG: Analysis result: ${enhancedText}`);
              
              // Create detailed failure message with analysis
              const failureMessage = `OCR Failed - No readable text detected.

Analysis: ${enhancedText}

Original response: ${extractedText}`;
              
              results.push({
                page: pageNumber,
                text: failureMessage,
                imagePath: imagePath
              });
              
              console.log(`📄 DEBUG: Page ${pageNumber} marked as OCR failure with detailed analysis`);
              
            } catch (enhancedError) {
              console.warn(`Enhanced analysis failed for page ${pageNumber}:`, enhancedError.message);
              results.push({
                page: pageNumber,
                text: `OCR Failed - ${extractedText}`,
                imagePath: imagePath
              });
              console.log(`📄 DEBUG: Page ${pageNumber} marked as OCR failure (simple)`);
            }
          } else {
            // Genuine success with meaningful content
            console.log(`✅ DEBUG: Final extracted text for page ${pageNumber}: ${extractedText.length} characters`);
            results.push({
              page: pageNumber,
              text: extractedText,
              imagePath: imagePath
            });
            console.log(`✅ DEBUG: GPT-4 Vision OCR completed successfully for page ${pageNumber}`);
          }
        }
      } catch (ocrError) {
        console.error('❌ DEBUG: OCR Error Details:');
        console.error(`❌ DEBUG: Error type: ${ocrError.constructor.name}`);
        console.error(`❌ DEBUG: Error message: ${ocrError.message}`);
        console.error(`❌ DEBUG: Error code: ${ocrError.code}`);
        console.error(`❌ DEBUG: Error status: ${ocrError.status}`);
        if (ocrError.stack) {
          console.error(`❌ DEBUG: Error stack: ${ocrError.stack}`);
        }
        
        console.error(`❌ DEBUG: GPT-4 Vision OCR error for page ${pageNumber}:`, ocrError.message);
        results.push({
          page: pageNumber,
          text: `OCR Error: ${ocrError.message}`,
          imagePath: imagePath
        });
      }
      
      console.log(`🔚 DEBUG: Completed processing page ${pageNumber}`);
      console.log('='.repeat(80));
    }
    
    console.log('🎉 DEBUG: GPT-4 Vision OCR processing completed');
    console.log(`📊 DEBUG: OCR Summary for ${imageObjects.length} pages:`);
    
    let successCount = 0;
    let errorCount = 0;
    let moderationCount = 0;
    let emptyCount = 0;
    let maskedCount = 0;
    let contentTriggerBreakdown = {
      violence: 0,
      explicit: 0,
      harmful: 0,
      illegal: 0,
      hate: 0,
      copyright: 0,
      privacy: 0,
      general: 0
    };
    
    results.forEach((result, index) => {
      if (result.text.startsWith('OCR Error:')) {
        errorCount++;
        console.log(`❌ DEBUG: Page ${result.page}: ERROR - ${result.text.substring(0, 100)}...`);
      } else if (result.text.includes('Content moderation') || result.text.includes('processing restricted')) {
        moderationCount++;
        console.log(`⚠️ DEBUG: Page ${result.page}: MODERATED - ${result.text.substring(0, 100)}...`);
      } else if (result.text.startsWith('OCR Failed') ||
                 result.text.length < 10 || 
                 result.text.toLowerCase().includes('no text detected') ||
                 result.text.toLowerCase().includes('no readable text') ||
                 result.text.toLowerCase().includes('no visible text') ||
                 result.text.toLowerCase().includes("i'm unable to transcribe") ||
                 result.text.toLowerCase().includes("unable to transcribe") ||
                 result.text.toLowerCase().includes("cannot transcribe")) {
        emptyCount++;
        console.log(`📄 DEBUG: Page ${result.page}: FAILED_OCR - ${result.text.substring(0, 100)}...`);
      } else if (result.text.includes('[CONTENT TRIGGER]') || result.text.includes('[CONTENT BLOCKED]')) {
        maskedCount++;
        const maskCount = (result.text.match(/\[CONTENT (TRIGGER|BLOCKED)\]/g) || []).length;
        
        // Analyze content trigger type for better reporting
        const lowerText = result.text.toLowerCase();
        if (lowerText.includes("violence") || lowerText.includes("violent")) {
          contentTriggerBreakdown.violence++;
        } else if (lowerText.includes("explicit") || lowerText.includes("sexual")) {
          contentTriggerBreakdown.explicit++;
        } else if (lowerText.includes("harmful") || lowerText.includes("dangerous")) {
          contentTriggerBreakdown.harmful++;
        } else if (lowerText.includes("illegal") || lowerText.includes("unlawful")) {
          contentTriggerBreakdown.illegal++;
        } else if (lowerText.includes("hate") || lowerText.includes("discriminatory")) {
          contentTriggerBreakdown.hate++;
        } else if (lowerText.includes("copyright") || lowerText.includes("intellectual property")) {
          contentTriggerBreakdown.copyright++;
        } else if (lowerText.includes("privacy") || lowerText.includes("personal information")) {
          contentTriggerBreakdown.privacy++;
        } else {
          contentTriggerBreakdown.general++;
        }
        
        console.log(`🎭 DEBUG: Page ${result.page}: MASKED_CONTENT - ${result.text.length} chars, ${maskCount} masked sections - ${result.text.substring(0, 50)}...`);
      } else {
        successCount++;
        console.log(`✅ DEBUG: Page ${result.page}: SUCCESS - ${result.text.length} chars - ${result.text.substring(0, 50)}...`);
      }
    });
    
    console.log(`📈 DEBUG: Final OCR Statistics:`);
    console.log(`✅ Successful: ${successCount}/${imageObjects.length} (${Math.round(successCount/imageObjects.length*100)}%)`);
    console.log(`❌ Technical Errors: ${errorCount}/${imageObjects.length} (${Math.round(errorCount/imageObjects.length*100)}%)`);
    console.log(`⚠️ Direct Moderation: ${moderationCount}/${imageObjects.length} (${Math.round(moderationCount/imageObjects.length*100)}%)`);
    console.log(`🎭 Content Triggers: ${maskedCount}/${imageObjects.length} (${Math.round(maskedCount/imageObjects.length*100)}%)`);
    console.log(`📄 Failed/No Text: ${emptyCount}/${imageObjects.length} (${Math.round(emptyCount/imageObjects.length*100)}%)`);
    
    // Detailed content trigger breakdown
    if (maskedCount > 0) {
      console.log(`\n🔍 DEBUG: Content Trigger Breakdown (${maskedCount} pages with masked content):`);
      Object.entries(contentTriggerBreakdown).forEach(([type, count]) => {
        if (count > 0) {
          const percentage = Math.round((count / maskedCount) * 100);
          const typeDescriptions = {
            violence: 'Violent content',
            explicit: 'Explicit/sexual content',
            harmful: 'Harmful/dangerous content',
            illegal: 'Illegal/unlawful content',
            hate: 'Hate/discriminatory content',
            copyright: 'Copyright/IP content',
            privacy: 'Privacy-sensitive content',
            general: 'General policy violations'
          };
          console.log(`  📊 ${typeDescriptions[type]}: ${count} pages (${percentage}% of masked content)`);
        }
      });
      
      console.log(`\n💡 DEBUG: Content Trigger Information:`);
      console.log(`  🎯 [CONTENT TRIGGER] placeholders are used when specific sections cannot be transcribed due to content policies`);
      console.log(`  📝 These placeholders preserve document structure while masking problematic content`);
      console.log(`  🔄 The system continues processing readable portions of documents normally`);
      console.log(`  📋 Manual review may be needed for pages with extensive content triggers`);
    }
    
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
      // Also add content trigger handling instructions
      const enhancedCustomPrompt = `${customTranslationPrompt}

IMPORTANT CONTENT TRIGGER INSTRUCTIONS:
- When you encounter [CONTENT TRIGGER] placeholders in the text, keep them exactly as [CONTENT TRIGGER] - do NOT translate them
- [CONTENT TRIGGER] indicates content that was blocked during OCR due to content policies
- Preserve these placeholders in your translation exactly as written
- Continue translating the text around these placeholders normally`;
      
      prompt = enhancedCustomPrompt.replace('{TEXT}', text);
      console.log('Using enhanced custom translation prompt with content trigger handling');
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
6. IMPORTANT: When you encounter [CONTENT TRIGGER] placeholders, keep them exactly as [CONTENT TRIGGER] - do NOT translate them
7. [CONTENT TRIGGER] indicates content that was blocked during OCR - preserve these placeholders in your translation
8. Provide only the translated content without additional commentary

${preserveInstructions}

CONTENT TRIGGER HANDLING:
- [CONTENT TRIGGER] = Content blocked during OCR due to content policies
- Keep [CONTENT TRIGGER] exactly as written in your translation
- Do not replace, translate, or modify [CONTENT TRIGGER] placeholders
- Continue translating the text around these placeholders normally

Source text for translation:
${text}

Translated text:`;
      console.log('Using default translation prompt for language:', sourceLanguage);
    }
    
    const systemContent = customTranslationPrompt 
      ? "You are an AI assistant that follows the given instructions precisely. When you encounter [CONTENT TRIGGER] placeholders, preserve them exactly as written - do not translate or modify them."
      : `You are an academic translator specializing in ${sourceLanguage === 'hindi' ? 'Hindi' : sourceLanguage === 'sanskrit' ? 'Sanskrit' : 'multilingual'} texts. Your role is to provide accurate English translations while maintaining scholarly precision and cultural context. When you encounter [CONTENT TRIGGER] placeholders, preserve them exactly as written in your translation.`;

    const completion = await retryOpenAICall(async () => {
      return await openai.chat.completions.create({
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
    }, 3, 2000); // 3 retries for translation
    
    const translation = completion.choices[0].message.content.trim();
    
    // Handle content moderation responses in translation
    if (translation.toLowerCase().includes("sorry, i can't assist") || 
        translation.toLowerCase().includes("i cannot help") ||
        translation.toLowerCase().includes("unable to process")) {
      console.warn(`Content moderation triggered during translation, attempting alternative approach...`);
      
      // Fallback: simpler translation prompt
      try {
        const fallbackCompletion = await retryOpenAICall(async () => {
          return await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `You are a linguistic assistant. Convert the provided text to English while maintaining academic accuracy. IMPORTANT: Preserve any [CONTENT TRIGGER] placeholders exactly as written - do not translate or modify them.`
              },
              {
                role: "user",
                content: `Convert this ${sourceLang} academic text to English. Keep any [CONTENT TRIGGER] placeholders unchanged:\n\n${text}`
              }
            ],
            max_tokens: 2000,
            temperature: 0.1
          });
        }, 2, 1500); // 2 retries for translation fallback
        
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

// Redo OCR and translation endpoint
app.post('/api/redo-ocr-translation', async (req, res) => {
  try {
    const { imagePath, language, customOcrPrompt, customTranslationPrompt } = req.body;
    if (!imagePath || !language) {
      return res.status(400).json({ error: 'Image path and language are required' });
    }

    console.log('Redo OCR and translation request received:', { imagePath, language });
    
    // Progress tracking function
    const progressUpdates = [];
    const sendProgress = (message) => {
      const timestamp = new Date().toLocaleTimeString();
      progressUpdates.push({ timestamp, message });
      console.log(`[REDO-OCR-T][${timestamp}] ${message}`);
    };

    // Convert relative path to absolute path
    const fullImagePath = path.join(__dirname, imagePath.replace('/uploads/', 'uploads/'));
    console.log('Processing image at:', fullImagePath);

    // Check if file exists
    if (!await fs.pathExists(fullImagePath)) {
      console.warn(`Image file not found: ${fullImagePath}`);
      return res.status(404).json({ error: 'Image file not found' });
    }

    // Extract page number from image path (e.g., page_1.png -> 1)
    const pageMatch = imagePath.match(/page_(\d+)\.png/);
    const pageNumber = pageMatch ? parseInt(pageMatch[1]) : 1;

    // Create a mock image object for the OCR function
    const imageObject = {
      imagePath: imagePath,
      pageNumber: pageNumber
    };

    sendProgress('Starting OCR re-processing...');
    
    // Re-run OCR using the same function as the main upload
    const ocrResults = await extractTextFromImages([imageObject], language, sendProgress, customOcrPrompt);
    
    if (ocrResults.length === 0) {
      return res.status(500).json({ error: 'Failed to extract text from image' });
    }

    const extractedText = ocrResults[0].text;
    sendProgress('OCR completed, starting translation...');

    // Re-run translation using the same function as the main upload
    const newTranslation = await translateText(extractedText, language, sendProgress, customTranslationPrompt);
    
    sendProgress('OCR and translation completed successfully');
    
    res.json({ 
      success: true, 
      text: extractedText,
      translation: newTranslation,
      progress: progressUpdates
    });

  } catch (error) {
    console.error('Redo OCR and translation error:', error);
    res.status(500).json({ error: 'Failed to redo OCR and translation: ' + error.message });
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
    
    // Clean old images from previous sessions (keep current session images for redo)
    console.log('Cleaning old images from previous sessions...');
    sendProgress('Cleaning up old files...');
    await fs.ensureDir(outputDir);
    
    try {
      const files = await fs.readdir(outputDir);
      const now = Date.now();
      const maxAge = 1000 * 60 * 60; // 1 hour
      
      for (const file of files) {
        const filePath = path.join(outputDir, file);
        try {
          const stats = await fs.stat(filePath);
          // Remove files older than 1 hour
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.remove(filePath);
            console.log(`Removed old image: ${file}`);
          }
        } catch (fileError) {
          console.log(`Error checking file ${file}:`, fileError.message);
        }
      }
    } catch (error) {
      console.log('Error cleaning old images:', error.message);
    }
    
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
    
    // Translate text using GPT (sequential processing)
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
    
    // Note: We keep the extracted images for potential redo operations
    // They will be cleaned up when a new upload session starts or by periodic cleanup
    
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
  console.log('🔧 DEBUG: Debug logging is ENABLED - you will see detailed OCR processing information');
  console.log('🔧 DEBUG: Look for emoji-prefixed messages during PDF processing');
}); 
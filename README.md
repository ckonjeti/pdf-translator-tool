# PDF Viewer Web Application

A modern web application that allows users to upload PDF documents of any size and view each page as an image. Built with React frontend and Node.js/Express backend.

## Features

- 📄 **PDF Upload**: Drag and drop or click to upload PDF files up to 100MB
- 🖼️ **Page-by-Page Viewing**: Each PDF page is converted to a high-quality image
- 📱 **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- 🔍 **Full-Size Viewing**: Click on any page to view it in full size with a modal
- ⚡ **Fast Processing**: Efficient PDF to image conversion using pdf2pic
- 🎨 **Modern UI**: Beautiful gradient design with smooth animations

## Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Multer** - File upload handling
- **pdf2pic** - PDF to image conversion
- **CORS** - Cross-origin resource sharing

### Frontend
- **React** - UI library
- **React Dropzone** - Drag and drop file upload
- **Axios** - HTTP client
- **Lucide React** - Modern icons
- **CSS3** - Styling with gradients and animations

## Prerequisites

Before running this application, make sure you have the following installed:

- **Node.js** (version 14 or higher)
- **npm** (comes with Node.js)

## Installation

1. **Clone or download the project files**

2. **Install backend dependencies**
   ```bash
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd client
   npm install
   cd ..
   ```

## Running the Application

### Development Mode

1. **Start the backend server**
   ```bash
   npm run dev
   ```
   This will start the server on `http://localhost:5000`

2. **In a new terminal, start the frontend**
   ```bash
   npm run client
   ```
   This will start the React development server on `http://localhost:3000`

3. **Open your browser** and navigate to `http://localhost:3000`

### Production Mode

1. **Build the frontend**
   ```bash
   npm run build
   ```

2. **Start the production server**
   ```bash
   npm start
   ```

3. **Open your browser** and navigate to `http://localhost:5000`

## Usage

1. **Upload a PDF**: Drag and drop a PDF file onto the upload area or click to select a file
2. **Wait for Processing**: The application will convert each page of the PDF to an image
3. **View Pages**: Each page will be displayed as a separate image with page numbers
4. **Full-Size View**: Click on any page or the "View Full Size" button to see it in a modal
5. **Close Modal**: Click outside the image or the X button to close the full-size view

## File Structure

```
pdf-viewer-app/
├── server.js              # Express server
├── package.json           # Backend dependencies
├── uploads/               # Uploaded files (auto-created)
│   └── images/           # Converted PDF pages
├── client/               # React frontend
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js        # Main React component
│   │   ├── App.css       # Component styles
│   │   ├── index.js      # React entry point
│   │   └── index.css     # Global styles
│   └── package.json      # Frontend dependencies
└── README.md
```

## API Endpoints

- `POST /api/upload` - Upload and process PDF files
- `GET /api/images` - Get list of converted images
- `GET /uploads/images/*` - Serve converted image files

## Configuration

### File Size Limits
The application supports PDF files up to 100MB. You can modify this limit in `server.js`:

```javascript
limits: {
  fileSize: 100 * 1024 * 1024 // 100MB limit
}
```

### Image Quality Settings
You can adjust the image quality and dimensions in `server.js`:

```javascript
const options = {
  density: 150,        // DPI (higher = better quality)
  saveFilename: "page",
  savePath: outputDir,
  format: "png",
  width: 1200,         // Image width
  height: 1600         // Image height
};
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   - Change the port in `server.js` or kill the process using the port

2. **PDF processing fails**
   - Ensure the PDF file is not corrupted
   - Check if the file is password protected
   - Verify the file size is within limits

3. **Images not loading**
   - Check if the `uploads/images` directory exists
   - Ensure proper file permissions

### Error Messages

- **"Only PDF files are allowed!"** - Upload a valid PDF file
- **"Failed to process PDF"** - The PDF might be corrupted or too large
- **"No file uploaded"** - Select a file before uploading

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

If you encounter any issues or have questions, please create an issue in the repository. 
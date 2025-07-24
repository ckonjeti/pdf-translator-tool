# Using Claude Code Inside Cursor AI

## Overview

This guide shows you how to integrate Claude AI into your development workflow within Cursor AI. Your Sanskrit translator application already uses Claude through the OpenAI API, and now you can extend this to enhance your development experience.

## Methods to Use Claude in Cursor AI

### 1. **Direct API Integration (Current Setup)**

Your application already uses Claude through OpenAI's API:

```javascript
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const completion = await openai.chat.completions.create({
  model: "gpt-4o", // This is Claude
  messages: [
    {
      role: "system",
      content: "You are a precise, literal translator..."
    },
    {
      role: "user", 
      content: prompt
    }
  ],
  max_tokens: 2000,
  temperature: 0.1
});
```

### 2. **Development Helper Tool**

Use the `ClaudeDevHelper` class for coding assistance:

```javascript
const ClaudeDevHelper = require('./claude-dev-helper');

const helper = new ClaudeDevHelper();

// Generate code
const code = await helper.generateCode('A function to validate email addresses');

// Debug code
const debugResult = await helper.debugCode(myCode, 'TypeError: Cannot read property...');

// Explain code
const explanation = await helper.explainCode(complexFunction);

// Suggest improvements
const improvements = await helper.suggestImprovements(myCode, 'performance');
```

### 3. **CLI Tool for Interactive Development**

Run the CLI tool for interactive Claude assistance:

```bash
node claude-cli.js
```

Available commands:
- `code <description>` - Generate code
- `debug <code>` - Debug code
- `explain <code>` - Explain code
- `improve <code>` - Suggest improvements
- `test <code>` - Generate tests
- `context <context>` - Add context
- `history` - Show conversation history
- `clear` - Clear history

## Setup Instructions

### 1. **Environment Variables**

Make sure your `OPENAI_API_KEY` is set:

```bash
# Windows
set OPENAI_API_KEY=your_api_key_here

# Linux/Mac
export OPENAI_API_KEY=your_api_key_here
```

### 2. **Install Dependencies**

The helper tools use the same dependencies as your main app:

```bash
npm install openai
```

### 3. **Make CLI Executable (Linux/Mac)**

```bash
chmod +x claude-cli.js
```

## Usage Examples

### **Code Generation**

```javascript
const helper = new ClaudeDevHelper();

// Generate a React component
const reactComponent = await helper.generateCode(
  'A React component for a contact form with validation',
  'jsx'
);

// Generate an API endpoint
const apiEndpoint = await helper.generateCode(
  'Express.js endpoint for user authentication',
  'javascript'
);
```

### **Code Debugging**

```javascript
const problematicCode = `
function calculateTotal(items) {
  return items.reduce((total, item) => total + item.price, 0);
}
`;

const debugResult = await helper.debugCode(
  problematicCode, 
  'TypeError: Cannot read property "price" of undefined'
);
```

### **Code Explanation**

```javascript
const complexFunction = `
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};
`;

const explanation = await helper.explainCode(complexFunction);
```

### **Performance Optimization**

```javascript
const slowCode = `
function findDuplicates(array) {
  const duplicates = [];
  for (let i = 0; i < array.length; i++) {
    for (let j = i + 1; j < array.length; j++) {
      if (array[i] === array[j] && !duplicates.includes(array[i])) {
        duplicates.push(array[i]);
      }
    }
  }
  return duplicates;
}
`;

const optimized = await helper.suggestImprovements(slowCode, 'performance');
```

## Integration with Your Sanskrit Translator

### **Enhancing Translation Logic**

You can use Claude to improve your translation functions:

```javascript
// Add this to your server.js
const ClaudeDevHelper = require('./claude-dev-helper');

// Create a helper instance for development
const devHelper = new ClaudeDevHelper();

// Use it to improve your translation prompts
async function improveTranslationPrompt(text, sourceLanguage) {
  const prompt = await devHelper.generateCode(
    `Generate an improved translation prompt for ${sourceLanguage} to English translation`,
    'text'
  );
  
  return prompt;
}
```

### **Adding New Features**

Use Claude to help implement new features:

```javascript
// Generate code for new OCR preprocessing
const preprocessingCode = await devHelper.generateCode(
  'Image preprocessing function for better OCR accuracy with Tesseract.js',
  'javascript'
);

// Generate error handling improvements
const errorHandling = await devHelper.generateCode(
  'Comprehensive error handling for PDF processing pipeline',
  'javascript'
);
```

## Best Practices

### 1. **Context Management**

Always provide context for better responses:

```javascript
helper.addContext('This is a Node.js Express application for PDF processing and translation');
helper.addContext('Using Tesseract.js for OCR and OpenAI API for translation');
```

### 2. **Conversation History**

Maintain conversation history for continuity:

```javascript
// The helper automatically maintains history
// You can access it:
const history = helper.getHistory();

// Or clear it when starting a new topic:
helper.clearHistory();
```

### 3. **Error Handling**

Always handle API errors gracefully:

```javascript
try {
  const result = await helper.generateCode(description);
  console.log(result);
} catch (error) {
  console.error('Claude API error:', error.message);
  // Fallback to manual coding
}
```

### 4. **Rate Limiting**

Be mindful of API rate limits:

```javascript
// Add delays between requests if needed
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function safeClaudeRequest(prompt) {
  const result = await helper.askForCodeHelp(prompt);
  await delay(1000); // 1 second delay
  return result;
}
```

## Advanced Usage

### **Custom Prompts**

Create specialized prompts for your domain:

```javascript
class SanskritDevHelper extends ClaudeDevHelper {
  async generateSanskritFunction(description) {
    return this.askForCodeHelp(
      `Generate JavaScript function for: ${description}. 
       Focus on Sanskrit text processing, Unicode handling, and Devanagari script support.`,
      'Sanskrit text processing'
    );
  }
  
  async optimizeOCR() {
    return this.askForCodeHelp(
      'Optimize Tesseract.js configuration for Sanskrit and Hindi OCR',
      'OCR optimization for Indic scripts'
    );
  }
}
```

### **Batch Processing**

Process multiple requests efficiently:

```javascript
async function batchCodeGeneration(descriptions) {
  const results = [];
  
  for (const description of descriptions) {
    const code = await helper.generateCode(description);
    results.push({ description, code });
    
    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return results;
}
```

## Troubleshooting

### **Common Issues**

1. **API Key Not Set**
   ```
   Error: OPENAI_API_KEY environment variable is not set
   ```
   Solution: Set your OpenAI API key in environment variables

2. **Rate Limiting**
   ```
   Error: Rate limit exceeded
   ```
   Solution: Add delays between requests or upgrade your API plan

3. **Model Not Available**
   ```
   Error: Model gpt-4o not found
   ```
   Solution: Use `gpt-3.5-turbo` as fallback

### **Debug Mode**

Enable debug logging:

```javascript
const helper = new ClaudeDevHelper();
helper.debug = true; // Add this to see detailed API calls
```

## Cost Management

### **Monitor Usage**

Track your API usage to manage costs:

```javascript
class CostAwareHelper extends ClaudeDevHelper {
  constructor() {
    super();
    this.tokenCount = 0;
  }
  
  async askForCodeHelp(prompt, context = '') {
    const result = await super.askForCodeHelp(prompt, context);
    // Estimate tokens (rough calculation)
    this.tokenCount += prompt.length / 4 + result.length / 4;
    console.log(`Estimated tokens used: ${this.tokenCount}`);
    return result;
  }
}
```

### **Optimize Prompts**

Use concise, specific prompts to reduce token usage:

```javascript
// Good: Specific and concise
await helper.generateCode('Express middleware for CORS');

// Avoid: Vague and verbose
await helper.generateCode('I need some code that handles cross-origin requests in my Express server, you know, like when you have a frontend and backend on different domains');
```

## Next Steps

1. **Start with the CLI tool** to get familiar with Claude's capabilities
2. **Integrate the helper** into your development workflow
3. **Create custom prompts** for your specific use cases
4. **Monitor API usage** to manage costs effectively
5. **Share successful prompts** with your team

## Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Claude API Reference](https://docs.anthropic.com/claude/reference)
- [Cursor AI Documentation](https://cursor.sh/docs)

---

This setup gives you powerful AI-assisted development capabilities directly within your Cursor AI environment, leveraging the same Claude API you're already using for translation! 
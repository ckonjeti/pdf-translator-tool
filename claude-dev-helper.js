const OpenAI = require('openai');

// Initialize OpenAI (Claude through OpenAI API)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class ClaudeDevHelper {
  constructor() {
    this.conversationHistory = [];
  }

  // Add context to conversation
  addContext(context) {
    this.conversationHistory.push({
      role: "system",
      content: context
    });
  }

  // Ask Claude for code help
  async askForCodeHelp(prompt, codeContext = '') {
    try {
      const fullPrompt = codeContext ? 
        `Context: ${codeContext}\n\nQuestion: ${prompt}` : 
        prompt;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a helpful coding assistant. Provide clear, concise code examples and explanations. Always include error handling and best practices."
          },
          ...this.conversationHistory,
          {
            role: "user",
            content: fullPrompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      });

      const response = completion.choices[0].message.content;
      
      // Add to conversation history
      this.conversationHistory.push(
        { role: "user", content: fullPrompt },
        { role: "assistant", content: response }
      );

      return response;
    } catch (error) {
      console.error('Error asking Claude for help:', error);
      return `Error: ${error.message}`;
    }
  }

  // Generate code snippets
  async generateCode(description, language = 'javascript') {
    return this.askForCodeHelp(
      `Generate ${language} code for: ${description}. Include comments and error handling.`,
      `Language: ${language}`
    );
  }

  // Debug code
  async debugCode(code, error = '') {
    const prompt = error ? 
      `Debug this code. Error: ${error}\n\nCode:\n${code}` :
      `Review this code for potential issues and suggest improvements:\n\n${code}`;
    
    return this.askForCodeHelp(prompt, 'Code debugging');
  }

  // Explain code
  async explainCode(code) {
    return this.askForCodeHelp(
      `Explain this code step by step:\n\n${code}`,
      'Code explanation'
    );
  }

  // Suggest improvements
  async suggestImprovements(code, focus = 'performance') {
    return this.askForCodeHelp(
      `Suggest improvements for this code, focusing on ${focus}:\n\n${code}`,
      'Code optimization'
    );
  }

  // Generate tests
  async generateTests(code, framework = 'jest') {
    return this.askForCodeHelp(
      `Generate ${framework} tests for this code:\n\n${code}`,
      `Testing with ${framework}`
    );
  }

  // Clear conversation history
  clearHistory() {
    this.conversationHistory = [];
  }

  // Get conversation history
  getHistory() {
    return this.conversationHistory;
  }
}

module.exports = ClaudeDevHelper;

// Example usage
if (require.main === module) {
  const helper = new ClaudeDevHelper();
  
  // Example: Generate a function
  helper.generateCode('A function to validate email addresses')
    .then(result => console.log('Generated code:', result))
    .catch(error => console.error('Error:', error));
} 
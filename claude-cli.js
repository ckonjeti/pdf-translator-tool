#!/usr/bin/env node

const readline = require('readline');
const ClaudeDevHelper = require('./claude-dev-helper');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const helper = new ClaudeDevHelper();

console.log('🤖 Claude Development Helper');
console.log('Type "help" for commands, "exit" to quit\n');

function showHelp() {
  console.log(`
Available commands:
  help                    - Show this help
  code <description>      - Generate code for description
  debug <code>           - Debug code (paste code after command)
  explain <code>         - Explain code (paste code after command)
  improve <code>         - Suggest improvements (paste code after command)
  test <code>            - Generate tests (paste code after command)
  context <context>      - Add context for better responses
  history                - Show conversation history
  clear                  - Clear conversation history
  exit                   - Exit the program
  `);
}

async function processCommand(input) {
  const parts = input.trim().split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (command) {
    case 'help':
      showHelp();
      break;

    case 'code':
      if (!args) {
        console.log('❌ Please provide a description for code generation');
        break;
      }
      console.log('🤔 Generating code...');
      const code = await helper.generateCode(args);
      console.log('✅ Generated code:\n');
      console.log(code);
      break;

    case 'debug':
      if (!args) {
        console.log('❌ Please provide code to debug');
        break;
      }
      console.log('🔍 Debugging code...');
      const debugResult = await helper.debugCode(args);
      console.log('✅ Debug result:\n');
      console.log(debugResult);
      break;

    case 'explain':
      if (!args) {
        console.log('❌ Please provide code to explain');
        break;
      }
      console.log('📖 Explaining code...');
      const explanation = await helper.explainCode(args);
      console.log('✅ Explanation:\n');
      console.log(explanation);
      break;

    case 'improve':
      if (!args) {
        console.log('❌ Please provide code to improve');
        break;
      }
      console.log('⚡ Suggesting improvements...');
      const improvements = await helper.suggestImprovements(args);
      console.log('✅ Improvements:\n');
      console.log(improvements);
      break;

    case 'test':
      if (!args) {
        console.log('❌ Please provide code to generate tests for');
        break;
      }
      console.log('🧪 Generating tests...');
      const tests = await helper.generateTests(args);
      console.log('✅ Generated tests:\n');
      console.log(tests);
      break;

    case 'context':
      if (!args) {
        console.log('❌ Please provide context');
        break;
      }
      helper.addContext(args);
      console.log('✅ Context added');
      break;

    case 'history':
      const history = helper.getHistory();
      if (history.length === 0) {
        console.log('📝 No conversation history');
      } else {
        console.log('📝 Conversation history:');
        history.forEach((msg, index) => {
          console.log(`${index + 1}. [${msg.role}]: ${msg.content.substring(0, 100)}...`);
        });
      }
      break;

    case 'clear':
      helper.clearHistory();
      console.log('✅ Conversation history cleared');
      break;

    case 'exit':
      console.log('👋 Goodbye!');
      rl.close();
      process.exit(0);
      break;

    default:
      console.log('❌ Unknown command. Type "help" for available commands');
  }
}

function prompt() {
  rl.question('\n🤖 Claude > ', async (input) => {
    await processCommand(input);
    prompt();
  });
}

// Check if OPENAI_API_KEY is set
if (!process.env.OPENAI_API_KEY) {
  console.log('❌ Error: OPENAI_API_KEY environment variable is not set');
  console.log('Please set your OpenAI API key:');
  console.log('export OPENAI_API_KEY=your_api_key_here');
  process.exit(1);
}

prompt(); 
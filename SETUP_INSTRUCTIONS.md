# Setup Instructions for Sanskrit Translator

## OpenAI API Key Setup

The application requires a valid OpenAI API key to perform translations. Follow these steps to set it up:

### Step 1: Get an OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in to your OpenAI account (or create one if you don't have one)
3. Click "Create new secret key"
4. Give it a name (e.g., "Sanskrit Translator")
5. Copy the generated API key (it starts with `sk-`)

### Step 2: Configure the Environment Variable

1. Open the `.env` file in the root directory of this project
2. Replace `your_openai_api_key_here` with your actual API key:
   ```
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```
3. Save the file

### Step 3: Install Dependencies and Start the Application

1. Install server dependencies:
   ```bash
   npm install
   ```

2. Install client dependencies:
   ```bash
   cd client
   npm install
   cd ..
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. In a new terminal, start the client:
   ```bash
   cd client
   npm start
   ```

### Troubleshooting

**Error: "The OPENAI_API_KEY environment variable is missing or empty"**
- Make sure you've saved the `.env` file with your actual API key
- Restart the server after making changes to the `.env` file
- Ensure there are no extra spaces around the API key

**Error: "Incorrect API key provided"**
- Double-check that you've copied the complete API key from OpenAI
- Make sure the API key is valid and hasn't been revoked
- Check your OpenAI account to ensure you have available credits

**Error: "You exceeded your current quota"**
- You may have reached your OpenAI usage limit
- Check your billing and usage at [OpenAI Platform](https://platform.openai.com/usage)
- Consider adding a payment method or upgrading your plan

### Security Note

- Never commit your actual API key to version control
- The `.env` file is already in `.gitignore` to prevent accidental commits
- Keep your API key secure and don't share it publicly
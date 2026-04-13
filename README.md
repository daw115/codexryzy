# ChatGPT App

A fully functional ChatGPT-like chat application powered by the [Quatarly API](https://api.quatarly.cloud).

## Features

- ChatGPT-like dark UI
- Streaming responses (real-time typing effect)
- Multiple AI models: Claude, GPT-4.1, Gemini 2.5 Pro
- Conversation history (saved in localStorage)
- Markdown rendering with code blocks, tables, etc.
- Copy message to clipboard
- Responsive design
- Settings panel for API key configuration

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/daw115/codexryzy.git
cd codexryzy
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure API key

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` and add your Quatarly API key:

```
VITE_API_KEY=qua-your-key-here
VITE_API_BASE_URL=https://api.quatarly.cloud/v0
```

Alternatively, you can set the API key directly in the app settings (gear icon in sidebar).

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for production

```bash
npm run build
npm run preview
```

## Available Models

| Model | Speed | Cost |
|-------|-------|------|
| Claude Haiku 4.5 | Fastest | 0.3x |
| Claude Sonnet 4.5 | Fast | 1x |
| Claude Sonnet Thinking | Medium | 1x |
| Claude Opus Thinking | Slow | 2x |
| GPT-4.1 | Fast | 1x |
| Gemini 2.5 Pro | Fast | 1x |

## API

This app uses the Quatarly API which is compatible with the OpenAI Chat Completions API format:

```
POST https://api.quatarly.cloud/v0/chat/completions
Authorization: Bearer YOUR_API_KEY
```

Get your API key at [api.quatarly.cloud/management](https://api.quatarly.cloud/management)

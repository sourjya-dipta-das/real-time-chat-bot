# 💬 Real-Time WhatsApp-Style Chat Application

A clean, simple, and beginner-friendly WhatsApp-style real-time web application built with **Node.js**, **Express**, **Socket.IO**, **Multer**, and **Google Gemini AI SDK (@google/genai)**.

---

## 🌟 Key Features

1. **Photo & File Sharing (WhatsApp Style)**:
   - Click the paperclip `📎` button to upload and send images (PNG, JPG, GIF) or files/documents (PDF, DOCX, TXT, ZIP).
   - Photos render inline in chat bubbles; documents display downloadable file cards with size details.
2. **Interactive Emoji Picker**:
   - Click the emoji `😀` button to open a popup grid and insert emojis directly into your messages.
3. **Intelligent Gemini AI Chatbot (@google/genai)**:
   - Select **AI Assistant 🤖** from your contacts or mention `@bot`.
   - Answers questions, responds naturally to greetings ("Hi", "Hello", "How are you?"), explains concepts (coding, WebSockets), and provides ChatGPT-style conversational responses.
   - Live Gemini 2.5 API integration via `@google/genai` with `GEMINI_API_KEY`.
4. **Google & Gmail Authentication**:
   - Google Sign-In via Google Identity Services + quick test profiles (`Alice`, `Bob`, `Charlie`).
5. **WhatsApp Message Delivery Status Ticks**:
   - `✓` **Single Gray Tick**: Sent to server.
   - `✓✓` **Double Gray Tick**: Delivered to recipient.
   - `<span style="color:#007bff">✓✓</span>` **Double Blue Tick**: Read by recipient.
6. **Online / Offline Status & Search**:
   - Green online indicator dots and search bar for quick user lookup.

---

## 📁 Project File Structure

```text
REAL-TIME CHAT BOX/
├── data/              # JSON database (users & messages)
├── public/
│   ├── uploads/       # Uploaded photos and files
│   ├── index.html     # WhatsApp layout (File attachment button & Emoji picker)
│   ├── style.css      # WhatsApp CSS styling (Photos, doc cards, emoji grid)
│   └── script.js      # Socket.IO client logic & file upload handlers
├── .env.example       # Example file for GEMINI_API_KEY
├── package.json       # Node.js dependencies (@google/genai, multer, socket.io)
├── server.js          # Express server with /api/upload & Gemini AI
└── README.md          # Guide & instructions
```

---

## 🚀 How to Run & Test

### 1. Start the Server
In your terminal, run:
```bash
npm start
```
The server will start on `http://localhost:3000`.

### 2. Optional: Configure Gemini AI Key
To enable live Google Gemini AI responses:
- Create a `.env` file in the project root.
- Add your key: `GEMINI_API_KEY=your_key_here` (Get a free key from [Google AI Studio](https://aistudio.google.com/)).

### 3. Test File Attachments & Emojis:
1. Open `http://localhost:3000` in two browser tabs (`Alice` and `Bob`).
2. **Send Photo/File**: In Alice's chat window with Bob, click the paperclip `📎` icon and choose an image or document -> click **Send**. The photo or downloadable file card appears in Bob's window instantly!
3. **Use Emojis**: Click the `😀` icon to insert emojis into your message.
4. **Chat with AI Assistant 🤖**: Select **AI Assistant 🤖** from the left contact list and ask *"Hi! Can you explain how Socket.IO works?"* -> enjoy natural, intelligent conversational replies!

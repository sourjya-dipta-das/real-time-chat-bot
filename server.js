// ===================================================
// Real-Time Chat App - WhatsApp Style Server (server.js)
// ===================================================
// Includes Google Auth, 1-to-1 Private Messaging, Read Ticks,
// File & Photo Attachments (Multer), Emojis, and Gemini AI Chatbot (@google/genai).

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configure Uploads Storage
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB limit

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API Endpoint for File & Image Uploads
app.post('/api/upload', upload.single('attachment'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const isImage = req.file.mimetype.startsWith('image/');
  const fileUrl = '/uploads/' + req.file.filename;

  res.json({
    url: fileUrl,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: formatBytes(req.file.size),
    isImage: isImage
  });
});

// Helper to format file sizes (e.g. "1.5 MB")
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Data Directory Persistence
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let registeredUsers = loadJSON(USERS_FILE, {});
let messageDatabase = loadJSON(MESSAGES_FILE, []);
const activeSockets = {};

function loadJSON(filePath, defaultVal) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
  }
  return defaultVal;
}

function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err);
  }
}

function getCurrentTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Initialize Google Gemini AI Instance
let aiClient = null;
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (apiKey) {
  try {
    aiClient = new GoogleGenAI({ apiKey: apiKey });
    console.log('🤖 Google Gemini AI Client initialized successfully!');
  } catch (err) {
    console.error('Gemini AI Init Error:', err);
  }
} else {
  console.log('💡 Tip: Set GEMINI_API_KEY in .env for full live Gemini AI responses.');
}

// Socket.IO Events
io.on('connection', (socket) => {
  let currentUserEmail = null;

  socket.on('authLogin', (userData) => {
    const email = userData.email ? userData.email.toLowerCase().trim() : '';
    const name = userData.name ? userData.name.trim() : 'Guest';
    const picture = userData.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email || name)}`;

    if (!email) return;

    currentUserEmail = email;
    activeSockets[email] = socket.id;
    socket.join(email);

    if (!registeredUsers[email]) {
      registeredUsers[email] = {
        email: email,
        name: name,
        picture: picture,
        online: true,
        lastSeen: new Date().toISOString()
      };
    } else {
      registeredUsers[email].name = name;
      if (userData.picture) registeredUsers[email].picture = userData.picture;
      registeredUsers[email].online = true;
      registeredUsers[email].lastSeen = new Date().toISOString();
    }

    saveData(USERS_FILE, registeredUsers);

    io.emit('userStatusChanged', {
      email: email,
      online: true,
      lastSeen: registeredUsers[email].lastSeen
    });

    let updatedPending = false;
    messageDatabase.forEach((msg) => {
      if (msg.receiverEmail === email && msg.status === 'sent') {
        msg.status = 'delivered';
        updatedPending = true;
        io.to(msg.senderEmail).emit('messageStatusUpdate', { messageId: msg.id, status: 'delivered' });
      }
    });

    if (updatedPending) saveData(MESSAGES_FILE, messageDatabase);

    socket.emit('authSuccess', {
      user: registeredUsers[email],
      users: getFormattedUsersList(email)
    });
  });

  socket.on('getUsers', () => {
    if (currentUserEmail) socket.emit('userListUpdate', getFormattedUsersList(currentUserEmail));
  });

  socket.on('getChatHistory', (targetEmail) => {
    if (!currentUserEmail || !targetEmail) return;
    const targetLower = targetEmail.toLowerCase().trim();

    const conversation = messageDatabase.filter(
      (m) =>
        (m.senderEmail === currentUserEmail && m.receiverEmail === targetLower) ||
        (m.senderEmail === targetLower && m.receiverEmail === currentUserEmail)
    );

    let readChanged = false;
    messageDatabase.forEach((msg) => {
      if (msg.senderEmail === targetLower && msg.receiverEmail === currentUserEmail && msg.status !== 'read') {
        msg.status = 'read';
        readChanged = true;
        io.to(targetLower).emit('messageStatusUpdate', { messageId: msg.id, status: 'read' });
      }
    });

    if (readChanged) {
      saveData(MESSAGES_FILE, messageDatabase);
      io.to(currentUserEmail).emit('userListUpdate', getFormattedUsersList(currentUserEmail));
      io.to(targetLower).emit('userListUpdate', getFormattedUsersList(targetLower));
    }

    socket.emit('chatHistory', { contactEmail: targetLower, messages: conversation });
  });

  // 1-to-1 Private Messaging (Supports text + file attachments)
  socket.on('sendPrivateMessage', ({ receiverEmail, text, file }) => {
    if (!currentUserEmail || !receiverEmail) return;

    const recLower = receiverEmail.toLowerCase().trim();
    const recipientOnline = registeredUsers[recLower] && registeredUsers[recLower].online;

    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      senderEmail: currentUserEmail,
      receiverEmail: recLower,
      text: text || '',
      file: file || null, // { url, name, type, size, isImage }
      timestamp: new Date().toISOString(),
      formattedTime: getCurrentTime(),
      status: recipientOnline ? 'delivered' : 'sent'
    };

    messageDatabase.push(newMsg);
    saveData(MESSAGES_FILE, messageDatabase);

    socket.emit('messageSentAck', newMsg);

    if (recipientOnline) {
      io.to(recLower).emit('receivePrivateMessage', newMsg);
    }

    io.to(currentUserEmail).emit('userListUpdate', getFormattedUsersList(currentUserEmail));
    io.to(recLower).emit('userListUpdate', getFormattedUsersList(recLower));

    // Handle Intelligent AI Bot replies
    if (recLower === 'bot@ai.com' || text.toLowerCase().includes('@bot')) {
      handleIntelligentBotReply(currentUserEmail, recLower, text, file);
    }
  });

  socket.on('markAsRead', (contactEmail) => {
    if (!currentUserEmail || !contactEmail) return;
    const contactLower = contactEmail.toLowerCase().trim();
    let updated = false;

    messageDatabase.forEach((msg) => {
      if (msg.senderEmail === contactLower && msg.receiverEmail === currentUserEmail && msg.status !== 'read') {
        msg.status = 'read';
        updated = true;
        io.to(contactLower).emit('messageStatusUpdate', { messageId: msg.id, status: 'read' });
      }
    });

    if (updated) {
      saveData(MESSAGES_FILE, messageDatabase);
      io.to(currentUserEmail).emit('userListUpdate', getFormattedUsersList(currentUserEmail));
      io.to(contactLower).emit('userListUpdate', getFormattedUsersList(contactLower));
    }
  });

  socket.on('typingPrivate', ({ receiverEmail, isTyping }) => {
    if (!currentUserEmail || !receiverEmail) return;
    io.to(receiverEmail.toLowerCase().trim()).emit('userTypingPrivate', {
      senderEmail: currentUserEmail,
      isTyping: isTyping
    });
  });

  socket.on('disconnect', () => {
    if (currentUserEmail && registeredUsers[currentUserEmail]) {
      registeredUsers[currentUserEmail].online = false;
      registeredUsers[currentUserEmail].lastSeen = new Date().toISOString();
      delete activeSockets[currentUserEmail];

      saveData(USERS_FILE, registeredUsers);
      io.emit('userStatusChanged', {
        email: currentUserEmail,
        online: false,
        lastSeen: registeredUsers[currentUserEmail].lastSeen
      });
    }
  });
});

function getFormattedUsersList(forUserEmail) {
  const list = [];
  Object.values(registeredUsers).forEach((u) => {
    if (u.email === forUserEmail) return;

    const convo = messageDatabase.filter(
      (m) =>
        (m.senderEmail === forUserEmail && m.receiverEmail === u.email) ||
        (m.senderEmail === u.email && m.receiverEmail === forUserEmail)
    );

    const lastMsg = convo.length > 0 ? convo[convo.length - 1] : null;
    let previewText = 'Tap to start chatting';
    if (lastMsg) {
      if (lastMsg.text) previewText = lastMsg.text;
      else if (lastMsg.file) previewText = lastMsg.file.isImage ? '📷 Photo' : `📄 ${lastMsg.file.name}`;
    }

    const unreadCount = messageDatabase.filter(
      (m) => m.senderEmail === u.email && m.receiverEmail === forUserEmail && m.status !== 'read'
    ).length;

    list.push({
      email: u.email,
      name: u.name,
      picture: u.picture,
      online: u.online,
      lastSeen: u.lastSeen,
      lastMessage: previewText,
      lastMessageTime: lastMsg ? lastMsg.formattedTime : '',
      lastMessageStatus: lastMsg && lastMsg.senderEmail === forUserEmail ? lastMsg.status : null,
      unreadCount: unreadCount
    });
  });

  return list.sort((a, b) => (b.unreadCount !== a.unreadCount ? b.unreadCount - a.unreadCount : a.name.localeCompare(b.name)));
}

// Intelligent Gemini AI Bot Conversation Engine
async function handleIntelligentBotReply(userEmail, botEmail, userText, userFile) {
  // Show bot typing status
  io.to(userEmail).emit('userTypingPrivate', { senderEmail: botEmail, isTyping: true });

  const query = userText.replace(/@bot/gi, '').trim();
  let aiReplyText = '';

  try {
    if (aiClient) {
      // Use Live Google Gemini 2.5 API
      const prompt = `You are a helpful, friendly, and intelligent AI assistant in a WhatsApp-style real-time chat application. Answer the user naturally, concisely, and conversationally. User's query: "${query}"`;
      
      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      aiReplyText = response.text ? response.text.trim() : 'I received your message!';
    } else {
      // Smart Conversational Fallback Engine
      aiReplyText = generateSmartConversationalReply(query, registeredUsers[userEmail] ? registeredUsers[userEmail].name : 'Friend');
    }
  } catch (err) {
    console.error('Gemini AI Generation Error:', err);
    aiReplyText = generateSmartConversationalReply(query, registeredUsers[userEmail] ? registeredUsers[userEmail].name : 'Friend');
  }

  setTimeout(() => {
    // Hide typing status
    io.to(userEmail).emit('userTypingPrivate', { senderEmail: botEmail, isTyping: false });

    const botMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      senderEmail: botEmail || 'bot@ai.com',
      receiverEmail: userEmail,
      text: aiReplyText,
      timestamp: new Date().toISOString(),
      formattedTime: getCurrentTime(),
      status: 'read'
    };

    messageDatabase.push(botMsg);
    saveData(MESSAGES_FILE, messageDatabase);

    io.to(userEmail).emit('receivePrivateMessage', botMsg);
    io.to(userEmail).emit('userListUpdate', getFormattedUsersList(userEmail));
  }, 1000);
}

// Natural Conversational Fallback Engine
function generateSmartConversationalReply(query, userName) {
  const q = query.toLowerCase();

  if (!q) {
    return `Hello ${userName}! 👋 Feel free to ask me anything, from coding questions to general advice!`;
  }

  // Greetings
  if (/^(hi|hello|hey|greetings|good morning|good evening|good afternoon)/.test(q)) {
    return `Hello ${userName}! 😊 How are you doing today? What can I help you with?`;
  }

  // Feelings / Status
  if (q.includes('how are you') || q.includes('how do you do')) {
    return `I'm doing fantastic, thank you for asking, ${userName}! Ready to help you with anything you need. How's your day going?`;
  }

  // Identity / Who are you
  if (q.includes('who are you') || q.includes('what is your name') || q.includes('what can you do')) {
    return `I am your AI Chatbot Assistant powered by Gemini AI! I can answer questions, help you debug code, explain complex topics, or just have a fun conversation.`;
  }

  // WebSockets / Real-time chat questions
  if (q.includes('websocket') || q.includes('socket') || q.includes('realtime') || q.includes('real time') || q.includes('how does this work')) {
    return `This real-time chat works using WebSockets via Socket.IO! When you send a message, the Node.js server receives it over a persistent two-way connection and delivers it instantly to the recipient with delivery ticks (✓ sent, ✓✓ delivered, blue ✓✓ read).`;
  }

  // Programming / Coding questions
  if (q.includes('javascript') || q.includes('node') || q.includes('express') || q.includes('code') || q.includes('html') || q.includes('css')) {
    return `Great technical question, ${userName}! In web development, Node.js runs JavaScript on the server side, Express handles backend routes, and Socket.IO manages instant WebSocket messaging. Let me know if you want code examples for any specific feature!`;
  }

  // Thanks
  if (q.includes('thank') || q.includes('thanks') || q.includes('awesome') || q.includes('cool')) {
    return `You're very welcome, ${userName}! 😄 Always happy to help. Let me know if you need anything else!`;
  }

  // Default intelligent response
  return `That's a great topic, ${userName}! I'm designed to help answer your questions, assist with your real-time chat project, and provide helpful insights. Feel free to ask me anything!`;
}

// Ensure default Bot exists
if (!registeredUsers['bot@ai.com']) {
  registeredUsers['bot@ai.com'] = {
    email: 'bot@ai.com',
    name: 'AI Assistant 🤖',
    picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=AIBot',
    online: true,
    lastSeen: new Date().toISOString()
  };
  saveData(USERS_FILE, registeredUsers);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

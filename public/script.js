// ===================================================
// Real-Time Chat App - Client Script (public/script.js)
// ===================================================
// Supports Google Auth, 1-to-1 Private Chat, File/Photo Attachments,
// Emoji Picker, WhatsApp Ticks & Intelligent Gemini AI.

const socket = io();

// State Variables
let currentUser = null;
let activeContact = null;
let allUsersList = [];
let typingTimeout = null;
let pendingAttachment = null;

// DOM Elements Selection
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const gmailForm = document.getElementById('gmail-login-form');
const inputName = document.getElementById('input-name');
const inputEmail = document.getElementById('input-email');

// Sidebar DOM
const myAvatar = document.getElementById('my-avatar');
const myName = document.getElementById('my-name');
const myEmail = document.getElementById('my-email');
const logoutBtn = document.getElementById('logout-btn');
const userSearchInput = document.getElementById('user-search-input');
const contactsList = document.getElementById('contacts-list');

// Main Chat DOM
const activeAvatar = document.getElementById('active-avatar');
const activeContactName = document.getElementById('active-contact-name');
const activeContactStatus = document.getElementById('active-contact-status');
const chatMessages = document.getElementById('chat-messages');
const typingIndicator = document.getElementById('typing-indicator');

// Forms & Attachments DOM
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const attachmentPreviewBanner = document.getElementById('attachment-preview-banner');
const attachmentName = document.getElementById('attachment-name');
const cancelAttachmentBtn = document.getElementById('cancel-attachment-btn');

// ---------------------------------------------------
// 1. AUTHENTICATION & LOGIN
// ---------------------------------------------------
function fillDemo(name, email) {
  inputName.value = name;
  inputEmail.value = email;
}

gmailForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = inputName.value.trim();
  const email = inputEmail.value.trim();

  if (name && email) {
    authenticateUser({
      name: name,
      email: email,
      picture: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`
    });
  }
});

function handleGoogleSignIn(response) {
  try {
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const payload = JSON.parse(jsonPayload);
    authenticateUser({
      name: payload.name,
      email: payload.email,
      picture: payload.picture
    });
  } catch (err) {
    console.error('Google Sign-In Decode Error:', err);
    alert('Google Sign in failed. Please use the Gmail form below.');
  }
}

function authenticateUser(userData) {
  socket.emit('authLogin', userData);
}

socket.on('authSuccess', ({ user, users }) => {
  currentUser = user;
  allUsersList = users;

  myAvatar.src = currentUser.picture;
  myName.textContent = currentUser.name;
  myEmail.textContent = currentUser.email;

  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');

  renderContactsList(allUsersList);
});

logoutBtn.addEventListener('click', () => {
  window.location.reload();
});

// ---------------------------------------------------
// 2. CONTACTS SEARCH & SELECTION
// ---------------------------------------------------
userSearchInput.addEventListener('input', () => {
  const query = userSearchInput.value.toLowerCase().trim();
  const filtered = allUsersList.filter(
    (u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
  );
  renderContactsList(filtered);
});

function renderContactsList(users) {
  contactsList.innerHTML = '';

  if (users.length === 0) {
    contactsList.innerHTML = '<li class="contact-item" style="color: #667781; font-size: 0.85rem;">No contacts found</li>';
    return;
  }

  users.forEach((contact) => {
    const li = document.createElement('li');
    li.classList.add('contact-item');
    if (activeContact && activeContact.email === contact.email) {
      li.classList.add('active');
    }

    const isOnline = contact.online;
    const unreadHTML = contact.unreadCount > 0 ? `<span class="unread-badge">${contact.unreadCount}</span>` : '';

    let tickHTML = '';
    if (contact.lastMessageStatus) {
      tickHTML = getTickHTML(contact.lastMessageStatus);
    }

    li.innerHTML = `
      <div class="avatar-wrapper">
        <img src="${contact.picture}" class="avatar" />
        <span class="status-badge ${isOnline ? 'online' : 'offline'}"></span>
      </div>
      <div class="contact-info">
        <div class="contact-header-row">
          <span class="contact-name">${escapeHTML(contact.name)}</span>
          <span class="contact-time">${contact.lastMessageTime || ''}</span>
        </div>
        <div class="contact-last-msg">
          ${tickHTML} ${escapeHTML(contact.lastMessage || '')}
        </div>
      </div>
      ${unreadHTML}
    `;

    li.addEventListener('click', () => {
      selectContact(contact);
    });

    contactsList.appendChild(li);
  });
}

function selectContact(contact) {
  activeContact = contact;
  renderContactsList(allUsersList);

  activeAvatar.src = contact.picture;
  activeContactName.textContent = contact.name;
  updateHeaderStatus(contact.online, contact.lastSeen);

  chatForm.classList.remove('hidden');
  messageInput.focus();

  socket.emit('getChatHistory', contact.email);
  typingIndicator.textContent = '';
}

function updateHeaderStatus(isOnline, lastSeen) {
  if (isOnline) {
    activeContactStatus.textContent = 'Online';
    activeContactStatus.className = 'status-text online-text';
  } else {
    const timeStr = lastSeen ? new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    activeContactStatus.textContent = timeStr ? `Offline • Last seen ${timeStr}` : 'Offline';
    activeContactStatus.className = 'status-text';
  }
}

// ---------------------------------------------------
// 3. FILE ATTACHMENT & EMOJI PICKER HANDLERS
// ---------------------------------------------------

// Trigger File Selector
attachBtn.addEventListener('click', () => {
  fileInput.click();
});

// File Selected -> Upload to Server API
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('attachment', file);

  try {
    attachmentName.textContent = `Uploading ${file.name}...`;
    attachmentPreviewBanner.classList.remove('hidden');

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.url) {
      pendingAttachment = data;
      attachmentName.textContent = data.isImage ? `📷 ${data.name}` : `📄 ${data.name} (${data.size})`;
    }
  } catch (err) {
    console.error('File Upload Error:', err);
    alert('File upload failed. Please try again.');
    clearAttachment();
  }
});

// Cancel Pending Attachment
cancelAttachmentBtn.addEventListener('click', () => {
  clearAttachment();
});

function clearAttachment() {
  pendingAttachment = null;
  fileInput.value = '';
  attachmentPreviewBanner.classList.add('hidden');
}

// Emoji Picker Toggle
emojiBtn.addEventListener('click', () => {
  emojiPicker.classList.toggle('hidden');
});

// Emoji Click -> Insert into Input
emojiPicker.addEventListener('click', (e) => {
  if (e.target.tagName === 'SPAN') {
    const emoji = e.target.textContent;
    messageInput.value += emoji;
    messageInput.focus();
    emojiPicker.classList.add('hidden');
  }
});

// Close Emoji picker when clicking outside
document.addEventListener('click', (e) => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
    emojiPicker.classList.add('hidden');
  }
});

// ---------------------------------------------------
// 4. MESSAGE SUBMIT & SOCKET LISTENERS
// ---------------------------------------------------
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();

  if (!activeContact) return;

  const text = messageInput.value.trim();

  if (text || pendingAttachment) {
    socket.emit('sendPrivateMessage', {
      receiverEmail: activeContact.email,
      text: text,
      file: pendingAttachment
    });

    messageInput.value = '';
    clearAttachment();
    messageInput.focus();

    socket.emit('typingPrivate', { receiverEmail: activeContact.email, isTyping: false });
  }
});

messageInput.addEventListener('input', () => {
  if (!activeContact) return;

  socket.emit('typingPrivate', { receiverEmail: activeContact.email, isTyping: true });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typingPrivate', { receiverEmail: activeContact.email, isTyping: false });
  }, 2000);
});

socket.on('chatHistory', ({ contactEmail, messages }) => {
  if (!activeContact || activeContact.email !== contactEmail) return;

  chatMessages.innerHTML = '';

  if (messages.length === 0) {
    chatMessages.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">👋</span>
        <p>No messages yet. Say hi to ${escapeHTML(activeContact.name)}!</p>
      </div>
    `;
    return;
  }

  messages.forEach((msg) => appendMessageBubble(msg));
  scrollToBottom();
});

socket.on('messageSentAck', (msg) => {
  if (activeContact && msg.receiverEmail === activeContact.email) {
    const emptyState = chatMessages.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    appendMessageBubble(msg);
    scrollToBottom();
  }
});

socket.on('receivePrivateMessage', (msg) => {
  if (activeContact && msg.senderEmail === activeContact.email) {
    const emptyState = chatMessages.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    appendMessageBubble(msg);
    scrollToBottom();

    socket.emit('markAsRead', activeContact.email);
  }
});

socket.on('messageStatusUpdate', ({ messageId, status }) => {
  const tickElement = document.getElementById(`tick_${messageId}`);
  if (tickElement) {
    tickElement.outerHTML = getTickHTML(status, messageId);
  }
});

socket.on('userListUpdate', (users) => {
  allUsersList = users;
  renderContactsList(allUsersList);

  if (activeContact) {
    const updatedActive = users.find((u) => u.email === activeContact.email);
    if (updatedActive) {
      activeContact.online = updatedActive.online;
      activeContact.lastSeen = updatedActive.lastSeen;
      updateHeaderStatus(activeContact.online, activeContact.lastSeen);
    }
  }
});

socket.on('userStatusChanged', ({ email, online, lastSeen }) => {
  const target = allUsersList.find((u) => u.email === email);
  if (target) {
    target.online = online;
    target.lastSeen = lastSeen;
    renderContactsList(allUsersList);
  }

  if (activeContact && activeContact.email === email) {
    activeContact.online = online;
    activeContact.lastSeen = lastSeen;
    updateHeaderStatus(online, lastSeen);
  }
});

socket.on('userTypingPrivate', ({ senderEmail, isTyping }) => {
  if (activeContact && activeContact.email === senderEmail) {
    typingIndicator.textContent = isTyping ? `${activeContact.name} is typing...` : '';
  }
});

// ---------------------------------------------------
// HELPER: RENDER MESSAGE BUBBLE WITH FILES & TICK MARKS
// ---------------------------------------------------
function appendMessageBubble(msg) {
  const isSentByMe = msg.senderEmail === currentUser.email;

  const div = document.createElement('div');
  div.classList.add('message');
  div.classList.add(isSentByMe ? 'sent' : 'received');
  div.id = `msg_container_${msg.id}`;

  let attachmentHTML = '';
  if (msg.file) {
    if (msg.file.isImage) {
      attachmentHTML = `
        <div class="message-image-container">
          <a href="${msg.file.url}" target="_blank">
            <img src="${msg.file.url}" class="message-image" alt="Uploaded Photo" />
          </a>
        </div>
      `;
    } else {
      attachmentHTML = `
        <div class="document-card">
          <span class="doc-icon">📄</span>
          <div class="doc-info">
            <div class="doc-name">${escapeHTML(msg.file.name)}</div>
            <div class="doc-size">${msg.file.size}</div>
          </div>
          <a href="${msg.file.url}" download="${msg.file.name}" class="download-link" title="Download File">📥</a>
        </div>
      `;
    }
  }

  const textHTML = msg.text ? `<div class="message-text">${escapeHTML(msg.text)}</div>` : '';
  const tickHTML = isSentByMe ? getTickHTML(msg.status, msg.id) : '';

  div.innerHTML = `
    ${attachmentHTML}
    ${textHTML}
    <div class="message-footer">
      <span>${msg.formattedTime || ''}</span>
      ${tickHTML}
    </div>
  `;

  chatMessages.appendChild(div);
}

function getTickHTML(status, id = '') {
  const idAttr = id ? `id="tick_${id}"` : '';
  if (status === 'read') return `<span ${idAttr} class="tick tick-read" title="Seen">✓✓</span>`;
  if (status === 'delivered') return `<span ${idAttr} class="tick tick-delivered" title="Delivered">✓✓</span>`;
  return `<span ${idAttr} class="tick tick-sent" title="Sent">✓</span>`;
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

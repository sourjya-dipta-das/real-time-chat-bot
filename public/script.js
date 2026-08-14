const socket = io();

let currentUser = null;
let activeContact = null;
let allUsersList = [];
let typingTimeout = null;
let pendingAttachment = null;

const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const gmailForm = document.getElementById("gmail-login-form");
const inputName = document.getElementById("input-name");
const inputEmail = document.getElementById("input-email");

const myAvatar = document.getElementById("my-avatar");
const myName = document.getElementById("my-name");
const myEmail = document.getElementById("my-email");
const logoutBtn = document.getElementById("logout-btn");
const userSearchInput = document.getElementById("user-search-input");
const contactsList = document.getElementById("contacts-list");

const activeAvatar = document.getElementById("active-avatar");
const activeContactName = document.getElementById("active-contact-name");
const activeContactStatus = document.getElementById("active-contact-status");
const chatMessages = document.getElementById("chat-messages");
const typingIndicator = document.getElementById("typing-indicator");

const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const emojiBtn = document.getElementById("emoji-btn");
const emojiPicker = document.getElementById("emoji-picker");
const attachmentPreviewBanner = document.getElementById(
  "attachment-preview-banner"
);
const attachmentName = document.getElementById("attachment-name");
const cancelAttachmentBtn = document.getElementById(
  "cancel-attachment-btn"
);

function fillDemo(name, email) {
  inputName.value = name;
  inputEmail.value = email;
}

gmailForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const name = inputName.value.trim();
  const email = inputEmail.value.trim().toLowerCase();

  if (!name || !email) {
    alert("Please enter your name and email.");
    return;
  }

  authenticateUser({
    name: name,
    email: email,
    picture:
      "https://api.dicebear.com/7.x/avataaars/svg?seed=" +
      encodeURIComponent(email)
  });
});

function authenticateUser(userData) {
  socket.emit("login", userData);
}

socket.on("loginSuccess", (user) => {
  currentUser = user;

  myAvatar.src =
    user.picture ||
    "https://api.dicebear.com/7.x/avataaars/svg?seed=" +
      encodeURIComponent(user.email);

  myName.textContent = user.name;
  myEmail.textContent = user.email;

  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  socket.emit("getUsers");
});

socket.on("users", (users) => {
  allUsersList = users;
  renderContactsList(allUsersList);
});

logoutBtn.addEventListener("click", () => {
  window.location.reload();
});

userSearchInput.addEventListener("input", () => {
  const query = userSearchInput.value.toLowerCase().trim();

  const filtered = allUsersList.filter((user) => {
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  });

  renderContactsList(filtered);
});

function renderContactsList(users) {
  contactsList.innerHTML = "";

  if (!users.length) {
    contactsList.innerHTML =
      '<li class="contact-item" style="color:#667781;">No contacts found</li>';
    return;
  }

  users.forEach((contact) => {
    const li = document.createElement("li");
    li.classList.add("contact-item");

    if (
      activeContact &&
      activeContact.email === contact.email
    ) {
      li.classList.add("active");
    }

    const avatar =
      contact.picture ||
      "https://api.dicebear.com/7.x/avataaars/svg?seed=" +
        encodeURIComponent(contact.email);

    li.innerHTML = `
      <div class="avatar-wrapper">
        <img src="${avatar}" class="avatar">
        <span class="status-badge ${
          contact.online ? "online" : "offline"
        }"></span>
      </div>

      <div class="contact-info">
        <div class="contact-header-row">
          <span class="contact-name">
            ${escapeHTML(contact.name || "User")}
          </span>
        </div>

        <div class="contact-last-msg">
          ${escapeHTML(contact.email)}
        </div>
      </div>
    `;

    li.addEventListener("click", () => {
      selectContact(contact);
    });

    contactsList.appendChild(li);
  });
}

function selectContact(contact) {
  activeContact = contact;

  renderContactsList(allUsersList);

  activeAvatar.src =
    contact.picture ||
    "https://api.dicebear.com/7.x/avataaars/svg?seed=" +
      encodeURIComponent(contact.email);

  activeContactName.textContent = contact.name;

  updateHeaderStatus(
    contact.online,
    contact.lastSeen
  );

  chatMessages.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">💬</span>
      <p>Loading chat...</p>
    </div>
  `;

  chatForm.classList.remove("hidden");

  messageInput.focus();

  socket.emit("getMessages", contact.email);

  typingIndicator.textContent = "";
}

function updateHeaderStatus(isOnline, lastSeen) {
  if (isOnline) {
    activeContactStatus.textContent = "Online";
    activeContactStatus.className =
      "status-text online-text";
  } else {
    let timeText = "";

    if (lastSeen) {
      timeText = new Date(lastSeen).toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );
    }

    activeContactStatus.textContent = timeText
      ? `Offline • Last seen ${timeText}`
      : "Offline";

    activeContactStatus.className = "status-text";
  }
}

attachBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];

  if (!file) return;

  const formData = new FormData();

  formData.append("file", file);

  try {
    attachmentName.textContent =
      `Uploading ${file.name}...`;

    attachmentPreviewBanner.classList.remove("hidden");

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Upload failed");
    }

    pendingAttachment = data;

    const isImage = data.type &&
      data.type.startsWith("image/");

    pendingAttachment.isImage = isImage;

    attachmentName.textContent = isImage
      ? `📷 ${data.name}`
      : `📄 ${data.name}`;
  } catch (error) {
    console.error("Upload error:", error);

    alert("File upload failed.");

    clearAttachment();
  }
});

cancelAttachmentBtn.addEventListener("click", () => {
  clearAttachment();
});

function clearAttachment() {
  pendingAttachment = null;
  fileInput.value = "";
  attachmentPreviewBanner.classList.add("hidden");
  attachmentName.textContent = "";
}

emojiBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  emojiPicker.classList.toggle("hidden");
});

emojiPicker.addEventListener("click", (e) => {
  if (e.target.tagName === "SPAN") {
    messageInput.value += e.target.textContent;
    messageInput.focus();
    emojiPicker.classList.add("hidden");
  }
});

document.addEventListener("click", (e) => {
  if (
    !emojiPicker.contains(e.target) &&
    e.target !== emojiBtn
  ) {
    emojiPicker.classList.add("hidden");
  }
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!activeContact) return;

  const text = messageInput.value.trim();

  if (!text && !pendingAttachment) return;

  socket.emit("sendMessage", {
    receiver: activeContact.email,
    text: text,
    file: pendingAttachment
  });

  messageInput.value = "";

  clearAttachment();

  messageInput.focus();

  socket.emit("typing", {
    receiver: activeContact.email,
    typing: false
  });
});

messageInput.addEventListener("input", () => {
  if (!activeContact) return;

  socket.emit("typing", {
    receiver: activeContact.email,
    typing: true
  });

  clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    socket.emit("typing", {
      receiver: activeContact.email,
      typing: false
    });
  }, 2000);
});

socket.on("messages", (messages) => {
  if (!activeContact) return;

  chatMessages.innerHTML = "";

  if (!messages.length) {
    chatMessages.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">👋</span>
        <p>
          No messages yet.
          Say hi to ${escapeHTML(activeContact.name)}!
        </p>
      </div>
    `;

    return;
  }

  messages.forEach((message) => {
    appendMessageBubble(message);
  });

  scrollToBottom();
});

socket.on("messageSent", (message) => {
  if (!activeContact) return;

  if (
    message.receiver !== activeContact.email &&
    message.sender !== activeContact.email
  ) {
    return;
  }

  const emptyState =
    chatMessages.querySelector(".empty-state");

  if (emptyState) {
    emptyState.remove();
  }

  if (message.sender === currentUser.email) {
    appendMessageBubble(message);
    scrollToBottom();
  }
});

socket.on("newMessage", (message) => {
  if (!activeContact) return;

  if (
    message.sender !== activeContact.email &&
    message.receiver !== activeContact.email
  ) {
    return;
  }

  const emptyState =
    chatMessages.querySelector(".empty-state");

  if (emptyState) {
    emptyState.remove();
  }

  if (message.sender === activeContact.email) {
    appendMessageBubble(message);
    scrollToBottom();

    socket.emit(
      "readMessages",
      activeContact.email
    );
  }

  socket.emit("getUsers");
});

socket.on("updateUsers", () => {
  socket.emit("getUsers");
});

socket.on("userOnline", ({ email, online }) => {
  const user = allUsersList.find(
    (item) => item.email === email
  );

  if (user) {
    user.online = online;
    renderContactsList(allUsersList);
  }

  if (
    activeContact &&
    activeContact.email === email
  ) {
    activeContact.online = online;
    updateHeaderStatus(
      activeContact.online,
      activeContact.lastSeen
    );
  }
});

socket.on("userOffline", ({ email, online }) => {
  const user = allUsersList.find(
    (item) => item.email === email
  );

  if (user) {
    user.online = online;
    user.lastSeen = new Date().toISOString();

    renderContactsList(allUsersList);
  }

  if (
    activeContact &&
    activeContact.email === email
  ) {
    activeContact.online = false;
    activeContact.lastSeen =
      new Date().toISOString();

    updateHeaderStatus(
      false,
      activeContact.lastSeen
    );
  }
});

socket.on("typing", ({ sender, typing }) => {
  if (
    activeContact &&
    sender === activeContact.email
  ) {
    typingIndicator.textContent = typing
      ? `${activeContact.name} is typing...`
      : "";
  }
});

socket.on("messagesRead", ({ user }) => {
  if (!activeContact) return;

  if (user === activeContact.email) {
    document
      .querySelectorAll(".tick")
      .forEach((tick) => {
        tick.outerHTML = getTickHTML(
          "read",
          tick.id.replace("tick_", "")
        );
      });
  }
});

function appendMessageBubble(message) {
  const isSentByMe =
    message.sender === currentUser.email;

  const div = document.createElement("div");

  div.classList.add("message");

  div.classList.add(
    isSentByMe ? "sent" : "received"
  );

  div.id = `msg_container_${message.id}`;

  let attachmentHTML = "";

  if (message.file) {
    const isImage =
      message.file.isImage ||
      (message.file.type &&
        message.file.type.startsWith("image/"));

    if (isImage) {
      attachmentHTML = `
        <div class="message-image-container">
          <a
            href="${message.file.url}"
            target="_blank"
          >
            <img
              src="${message.file.url}"
              class="message-image"
              alt="Uploaded Photo"
            >
          </a>
        </div>
      `;
    } else {
      attachmentHTML = `
        <div class="document-card">
          <span class="doc-icon">📄</span>

          <div class="doc-info">
            <div class="doc-name">
              ${escapeHTML(message.file.name || "File")}
            </div>

            <div class="doc-size">
              ${message.file.size || ""}
            </div>
          </div>

          <a
            href="${message.file.url}"
            download
            class="download-link"
          >
            📥
          </a>
        </div>
      `;
    }
  }

  const textHTML = message.text
    ? `
      <div class="message-text">
        ${escapeHTML(message.text)}
      </div>
    `
    : "";

  const formattedTime = message.time
    ? new Date(message.time).toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )
    : "";

  const tickHTML = isSentByMe
    ? getTickHTML(message.status, message.id)
    : "";

  div.innerHTML = `
    ${attachmentHTML}

    ${textHTML}

    <div class="message-footer">
      <span>${formattedTime}</span>
      ${tickHTML}
    </div>
  `;

  chatMessages.appendChild(div);
}

function getTickHTML(status, id = "") {
  const idAttribute = id
    ? `id="tick_${id}"`
    : "";

  if (status === "read") {
    return `
      <span
        ${idAttribute}
        class="tick tick-read"
      >
        ✓✓
      </span>
    `;
  }

  if (status === "delivered") {
    return `
      <span
        ${idAttribute}
        class="tick tick-delivered"
      >
        ✓✓
      </span>
    `;
  }

  return `
    <span
      ${idAttribute}
      class="tick tick-sent"
    >
      ✓
    </span>
  `;
}

function scrollToBottom() {
  chatMessages.scrollTop =
    chatMessages.scrollHeight;
}

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
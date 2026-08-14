const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  next();
});

app.use(express.static(path.join(__dirname, "public")));

const dataFolder = path.join(__dirname, "data");
const uploadFolder = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
}

if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

const usersFile = path.join(dataFolder, "users.json");
const messagesFile = path.join(dataFolder, "messages.json");

if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, "{}");
}

if (!fs.existsSync(messagesFile)) {
  fs.writeFileSync(messagesFile, "[]");
}

let users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
let messages = JSON.parse(fs.readFileSync(messagesFile, "utf8"));

function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function saveMessages() {
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadFolder);
  },

  filename: function (req, file, cb) {
    const name = Date.now() + "-" + file.originalname;
    cb(null, name);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No file uploaded"
    });
  }

  res.json({
    url: "/uploads/" + req.file.filename,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size
  });
});

const onlineUsers = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("login", (user) => {
    console.log("LOGIN RECEIVED:", user);

    if (!user || !user.email) {
      socket.emit("loginError", {
        message: "Email is required"
      });
      return;
    }

    const email = String(user.email).toLowerCase().trim();

    if (!email) {
      socket.emit("loginError", {
        message: "Invalid email"
      });
      return;
    }

    socket.userEmail = email;
    socket.join(email);
    onlineUsers[email] = socket.id;

    if (!users[email]) {
      users[email] = {
        email: email,
        name: user.name || "User",
        picture: user.picture || "",
        online: true,
        lastSeen: new Date().toISOString()
      };
    } else {
      users[email].online = true;
      users[email].lastSeen = new Date().toISOString();

      if (user.name) {
        users[email].name = user.name;
      }

      if (user.picture) {
        users[email].picture = user.picture;
      }
    }

    saveUsers();

    console.log("LOGIN SUCCESS:", email);

    socket.emit("loginSuccess", users[email]);

    sendUsers();

    io.emit("userOnline", {
      email: email,
      online: true
    });
  });

  socket.on("getUsers", () => {
    sendUsers();
  });

  function sendUsers() {
    const list = Object.values(users).filter(
      (user) => user.email !== socket.userEmail
    );

    socket.emit("users", list);
  }

  socket.on("getMessages", (friendEmail) => {
    if (!socket.userEmail || !friendEmail) {
      return;
    }

    const chat = messages.filter((message) => {
      return (
        (
          message.sender === socket.userEmail &&
          message.receiver === friendEmail
        ) ||
        (
          message.sender === friendEmail &&
          message.receiver === socket.userEmail
        )
      );
    });

    socket.emit("messages", chat);
  });

  socket.on("sendMessage", (data) => {
    if (!socket.userEmail || !data || !data.receiver) {
      return;
    }

    const message = {
      id: Date.now(),
      sender: socket.userEmail,
      receiver: data.receiver,
      text: data.text || "",
      file: data.file || null,
      time: new Date().toISOString(),
      status: onlineUsers[data.receiver]
        ? "delivered"
        : "sent"
    };

    messages.push(message);
    saveMessages();

    socket.emit("messageSent", message);

    io.to(data.receiver).emit("newMessage", message);

    io.to(socket.userEmail).emit("updateUsers");
    io.to(data.receiver).emit("updateUsers");

    if (
      data.receiver === "bot@ai.com" ||
      data.text?.toLowerCase().includes("@bot")
    ) {
      setTimeout(() => {
        const question = (data.text || "")
          .replace("@bot", "")
          .trim();

        const reply = getBotReply(question);

        const botMessage = {
          id: Date.now(),
          sender: "bot@ai.com",
          receiver: socket.userEmail,
          text: reply,
          time: new Date().toISOString(),
          status: "read"
        };

        messages.push(botMessage);
        saveMessages();

        io.to(socket.userEmail).emit(
          "newMessage",
          botMessage
        );
      }, 1000);
    }
  });

  socket.on("typing", (data) => {
    if (!socket.userEmail || !data || !data.receiver) {
      return;
    }

    io.to(data.receiver).emit("typing", {
      sender: socket.userEmail,
      typing: data.typing
    });
  });

  socket.on("readMessages", (friendEmail) => {
    if (!socket.userEmail) {
      return;
    }

    messages.forEach((message) => {
      if (
        message.sender === friendEmail &&
        message.receiver === socket.userEmail
      ) {
        message.status = "read";
      }
    });

    saveMessages();

    io.to(friendEmail).emit("messagesRead", {
      user: socket.userEmail
    });
  });

  socket.on("disconnect", () => {
    const email = socket.userEmail;

    if (!email) {
      return;
    }

    delete onlineUsers[email];

    if (users[email]) {
      users[email].online = false;
      users[email].lastSeen = new Date().toISOString();
      saveUsers();
    }

    io.emit("userOffline", {
      email: email,
      online: false
    });

    console.log("User disconnected:", email);
  });
});

function getBotReply(question) {
  const q = String(question || "").toLowerCase();

  if (q.includes("hello") || q.includes("hi")) {
    return "Hello! 👋 How can I help you?";
  }

  if (q.includes("how are you")) {
    return "I'm doing great! 😊 What about you?";
  }

  if (q.includes("javascript")) {
    return "JavaScript is a programming language mainly used to make websites interactive.";
  }

  if (q.includes("react")) {
    return "React is a JavaScript library used to build user interfaces.";
  }

  if (q.includes("node")) {
    return "Node.js allows you to run JavaScript on the server.";
  }

  if (q.includes("socket")) {
    return "Socket.IO is used to create real-time communication between the client and server.";
  }

  if (q.includes("thank")) {
    return "You're welcome! 😊";
  }

  return "That's interesting! 🤖 I'm your AI chat assistant. Ask me something about coding, React, JavaScript or your project.";
}

if (!users["bot@ai.com"]) {
  users["bot@ai.com"] = {
    email: "bot@ai.com",
    name: "AI Assistant 🤖",
    picture: "https://api.dicebear.com/7.x/bottts/svg?seed=AI",
    online: true,
    lastSeen: new Date().toISOString()
  };

  saveUsers();
}

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
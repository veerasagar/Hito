require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const auth = require('./auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Redis clients
const redisClient = redis.createClient();
const pubClient = redis.createClient();
const subClient = redis.createClient();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Handle Redis connection errors
redisClient.on('error', (err) => console.log('Redis Client Error', err));
pubClient.on('error', (err) => console.log('Redis Pub Error', err));
subClient.on('error', (err) => console.log('Redis Sub Error', err));

// Initialize default chat room
async function initializeRoom() {
  await redisClient.connect();
  await pubClient.connect();
  await subClient.connect();
  
  await redisClient.sAdd('rooms', 'general');
  console.log('Chat room initialized');
}
initializeRoom();

// Helper function to generate conversation key
function getConversationKey(user1, user2) {
  return [user1, user2].sort().join(':');
}

// Authentication middleware for HTTP routes
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Routes
app.get('/api/user', authenticateToken, async (req, res) => {
  try {
    const user = await redisClient.hGetAll(`user:${req.user.username}`);
    if (!user || Object.keys(user).length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ username: user.username, createdAt: user.createdAt });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/online-users', async (req, res) => {
  try {
    const users = await redisClient.zRange('online_status', 0, -1);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve login and register pages
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Mount auth routes
app.use('/auth', auth);

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Authentication error'));
    socket.user = user;
    next();
  });
});

// Handle WebSocket connections
io.on('connection', (socket) => {
  console.log('User connected:', socket.user.username);
  const username = socket.user.username;
  
  // Join user's own room for private messages
  socket.join(username);
  
  // Join room handler
  socket.on('joinRoom', async ({ room }) => {
    socket.join(room);
    socket.room = room;
    
    // Add user to online set
    await redisClient.zAdd('online_status', [
      { score: Date.now(), value: username }
    ]);
    
    // Fetch last 20 messages
    const messages = await redisClient.zRange(`messages:${room}`, -20, -1);
    messages.forEach(msg => {
      socket.emit('message', JSON.parse(msg));
    });
    
    console.log(`${username} joined ${room}`);
  });

  // Message handler (public room)
  socket.on('chatMessage', async (msg) => {
    const message = {
      username,
      text: msg,
      timestamp: Date.now(),
      room: socket.room,
      type: 'public'
    };
    
    // Store in Redis sorted set
    await redisClient.zAdd(
      `messages:${socket.room}`,
      { score: message.timestamp, value: JSON.stringify(message) }
    );
    
    // Publish to Redis channel
    await pubClient.publish(`chat:${socket.room}`, JSON.stringify(message));
  });

  // Private message handler
  socket.on('privateMessage', async ({ to, text }) => {
    const from = username;
    const conversationKey = getConversationKey(from, to);
    const message = {
      from,
      to,
      text,
      timestamp: Date.now(),
      type: 'private'
    };
    
    // Store the message in Redis
    await redisClient.zAdd(
      `private:${conversationKey}`,
      { score: message.timestamp, value: JSON.stringify(message) }
    );
    
    // Add to both users' conversation sets
    await redisClient.sAdd(`user:${from}:conversations`, to);
    await redisClient.sAdd(`user:${to}:conversations`, from);
    
    // Publish to the private channel
    await pubClient.publish(`private:${from}:${to}`, JSON.stringify(message));
    await pubClient.publish(`private:${to}:${from}`, JSON.stringify(message));
  });

  // Fetch private conversation history
  socket.on('getPrivateHistory', async ({ withUser }) => {
    const user = username;
    const conversationKey = getConversationKey(user, withUser);
    const messages = await redisClient.zRange(`private:${conversationKey}`, -50, -1);
    socket.emit('privateHistory', {
      withUser,
      messages: messages.map(msg => JSON.parse(msg))
    });
  });

  // Fetch user's conversations
  socket.on('getConversations', async () => {
    const user = username;
    const conversations = await redisClient.sMembers(`user:${user}:conversations`);
    socket.emit('conversations', conversations);
  });

  // Presence heartbeat
  socket.on('heartbeat', async () => {
    await redisClient.zAdd('online_status', [
      { score: Date.now(), value: username }
    ]);
  });

  // Cleanup on disconnect
  socket.on('disconnect', async () => {
    console.log('User disconnected:', username);
  });
});

// Subscribe to public chat channels
subClient.pSubscribe('chat:*', (message, channel) => {
  const room = channel.replace('chat:', '');
  io.to(room).emit('message', JSON.parse(message));
});

// Subscribe to private messages
subClient.pSubscribe('private:*', (message, channel) => {
  const [type, from, to] = channel.split(':');
  io.to(from).to(to).emit('privateMessage', JSON.parse(message));
});

// Clean up inactive users (every 1 minute)
setInterval(async () => {
  const fiveMinutesAgo = Date.now() - 300000;
  await redisClient.zRemRangeByScore(
    'online_status', 
    '-inf', 
    fiveMinutesAgo
  );
}, 60000);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
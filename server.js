const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Redis clients
const redisClient = redis.createClient();
const pubClient = redis.createClient();
const subClient = redis.createClient();

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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join room handler
  socket.on('joinRoom', async ({ room, username }) => {
    socket.join(room);
    socket.room = room;
    socket.username = username;
    
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

  // Message handler
  socket.on('chatMessage', async (msg) => {
    const message = {
      username: socket.username,
      text: msg,
      timestamp: Date.now(),
      room: socket.room
    };
    
    // Store in Redis sorted set
    await redisClient.zAdd(
      `messages:${socket.room}`,
      { score: message.timestamp, value: JSON.stringify(message) }
    );
    
    // Publish to Redis channel
    await pubClient.publish(`chat:${socket.room}`, JSON.stringify(message));
  });

  // Presence heartbeat
  socket.on('heartbeat', async (username) => {
    await redisClient.zAdd('online_status', [
      { score: Date.now(), value: username }
    ]);
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Subscribe to Redis channels
subClient.pSubscribe('chat:*', (message, channel) => {
  const room = channel.replace('chat:', '');
  io.to(room).emit('message', JSON.parse(message));
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
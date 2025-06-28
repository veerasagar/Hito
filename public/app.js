document.addEventListener('DOMContentLoaded', () => {
  // Check authentication
  const token = localStorage.getItem('chat_token');
  if (!token) {
    window.location.href = '/login';
    return;
  }
  
  // Initialize Socket.IO connection
  const socket = io({
    auth: {
      token: token
    }
  });
  
  // DOM elements
  const chatMessages = document.getElementById('chat-messages');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const onlineUsersList = document.getElementById('online-users');
  const conversationsList = document.getElementById('conversations');
  const usernameDisplay = document.getElementById('username-display');
  const chatWith = document.getElementById('chat-with');
  const onlineCount = document.getElementById('online-count');
  const newConversationBtn = document.getElementById('new-conversation-btn');
  const newRoomBtn = document.getElementById('new-room-btn');
  const roomList = document.getElementById('room-list');
  const roomModal = document.getElementById('room-modal');
  const closeRoomModal = document.getElementById('close-room-modal');
  const createRoomBtn = document.getElementById('create-room-btn');
  const roomNameInput = document.getElementById('room-name');
  const roomPublicCheckbox = document.getElementById('room-public');
  
  // State
  let currentChat = {
    type: 'public', // 'public' or 'private'
    target: 'general' // room name or username
  };
  
  // Fetch user info
  fetch('/api/user', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) throw new Error('Failed to get user info');
    return response.json();
  })
  .then(user => {
    usernameDisplay.textContent = user.username;
    // Fetch conversations
    socket.emit('getConversations');
    // Fetch rooms
    fetchRooms();
  })
  .catch(error => {
    console.error('User info error:', error);
    localStorage.removeItem('chat_token');
    window.location.href = '/login';
  });
  
  // Join default public room
  socket.emit('joinRoom', { room: 'general' });
  
  // Send message handler
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  
  function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
      if (currentChat.type === 'public') {
        socket.emit('chatMessage', message);
      } else if (currentChat.type === 'private') {
        socket.emit('privateMessage', {
          to: currentChat.target,
          text: message
        });
      }
      messageInput.value = '';
    }
  }
  
  // Receive public messages
  socket.on('message', (msg) => {
    if (currentChat.type === 'public' && currentChat.target === msg.room) {
      addMessageToChat(msg);
    }
  });
  
  // Receive private messages
  socket.on('privateMessage', (msg) => {
    // If we are in a private chat with the sender or recipient, show the message
    if (currentChat.type === 'private' && 
        (currentChat.target === msg.from || currentChat.target === msg.to)) {
      addMessageToChat({
        username: msg.from,
        text: msg.text,
        timestamp: msg.timestamp,
        type: 'private'
      });
    }
  });
  
  // Add message to UI
  function addMessageToChat(msg) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    const timestamp = new Date(msg.timestamp).toLocaleTimeString();
    const isCurrentUser = msg.username === usernameDisplay.textContent;
    
    messageElement.innerHTML = `
      <div class="message-header">
        <span class="username ${isCurrentUser ? 'current-user' : ''}">
          ${msg.username || msg.from}
        </span>
        <span class="timestamp">${timestamp}</span>
      </div>
      <div class="message-text">${msg.text}</div>
    `;
    
    if (isCurrentUser) {
      messageElement.classList.add('current-user');
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Handle conversation list
  socket.on('conversations', (conversations) => {
    conversationsList.innerHTML = '';
    conversations.forEach(user => {
      const li = document.createElement('li');
      li.textContent = user;
      li.addEventListener('click', () => openPrivateChat(user));
      conversationsList.appendChild(li);
    });
  });
  
  // Handle private history
  socket.on('privateHistory', ({ withUser, messages }) => {
    if (currentChat.type === 'private' && currentChat.target === withUser) {
      chatMessages.innerHTML = '';
      messages.forEach(msg => {
        addMessageToChat({
          username: msg.from,
          text: msg.text,
          timestamp: msg.timestamp,
          type: 'private'
        });
      });
    }
  });
  
  // Open private chat with a user
  function openPrivateChat(withUser) {
    // Update state
    currentChat = {
      type: 'private',
      target: withUser
    };
    
    // Update UI
    chatWith.textContent = `Private Chat with ${withUser}`;
    chatMessages.innerHTML = '';
    
    // Fetch history
    socket.emit('getPrivateHistory', { withUser });
  }
  
  // Open room creation modal
  newRoomBtn.addEventListener('click', () => {
    roomModal.style.display = 'block';
  });
  
  // Close room modal
  closeRoomModal.addEventListener('click', () => {
    roomModal.style.display = 'none';
  });
  
  // Create new room
  createRoomBtn.addEventListener('click', async () => {
    const roomName = roomNameInput.value.trim();
    const isPublic = roomPublicCheckbox.checked;
    
    if (!roomName) {
      alert('Please enter a room name');
      return;
    }
    
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: roomName, isPublic })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create room');
      }
      
      // Refresh rooms list
      fetchRooms();
      roomModal.style.display = 'none';
      roomNameInput.value = '';
      
      // Join the new room
      joinRoom(roomName);
    } catch (error) {
      alert(error.message);
    }
  });
  
  // Join a room
  function joinRoom(roomName) {
    // Update state
    currentChat = {
      type: 'public',
      target: roomName
    };
    
    // Update UI
    chatWith.textContent = roomName;
    chatMessages.innerHTML = '';
    
    // Join room
    socket.emit('joinRoom', { room: roomName });
  }
  
  // Fetch all rooms
  function fetchRooms() {
    fetch('/api/rooms', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => response.json())
    .then(rooms => {
      renderRooms(rooms);
    })
    .catch(error => {
      console.error('Error fetching rooms:', error);
    });
  }
  
  // Render rooms list
  function renderRooms(rooms) {
    roomList.innerHTML = '';
    
    rooms.forEach(room => {
      const li = document.createElement('li');
      li.className = 'room-item';
      
      li.innerHTML = `
        <div class="room-info">
          <span class="room-name">${room.name}</span>
          <span class="room-creator">by ${room.creator}</span>
        </div>
        <div class="room-meta">
          <span class="room-public">${room.isPublic ? 'Public' : 'Private'}</span>
        </div>
      `;
      
      li.addEventListener('click', () => joinRoom(room.name));
      roomList.appendChild(li);
    });
  }
  
  // Online users list
  function updateOnlineUsers(users) {
    onlineUsersList.innerHTML = '';
    onlineCount.textContent = users.length;
    
    // Populate conversation modal select
    const conversationUserSelect = document.getElementById('conversation-user');
    if (conversationUserSelect) {
      conversationUserSelect.innerHTML = '';
      const currentUser = usernameDisplay.textContent;
      
      users.forEach(user => {
        if (user === currentUser) return;
        
        // Add to online list
        const li = document.createElement('li');
        li.textContent = user;
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => openPrivateChat(user));
        onlineUsersList.appendChild(li);
        
        // Add to conversation modal select
        const option = document.createElement('option');
        option.value = user;
        option.textContent = user;
        conversationUserSelect.appendChild(option);
      });
    }
  }
  
  // Presence heartbeat (every 10 seconds)
  setInterval(() => {
    socket.emit('heartbeat');
  }, 10000);
  
  // Fetch online users (every 5 seconds)
  setInterval(() => {
    fetch('/api/online-users')
      .then(response => response.json())
      .then(users => updateOnlineUsers(users))
      .catch(error => console.error('Online users error:', error));
  }, 5000);
  
  // Logout handler
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('chat_token');
    window.location.href = '/login';
  });
});
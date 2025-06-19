// Handle login form submission
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }
    
    const { token } = await response.json();
    localStorage.setItem('chat_token', token);
    window.location.href = '/';
  } catch (error) {
    document.getElementById('error-message').textContent = error.message;
  }
});

// Handle registration form submission
document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('reg-username').value;
  const password = document.getElementById('reg-password').value;
  
  try {
    const response = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }
    
    alert('Registration successful! Please login.');
    window.location.href = '/login';
  } catch (error) {
    document.getElementById('reg-error-message').textContent = error.message;
  }
});

// Main chat app
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
  const usernameDisplay = document.getElementById('username-display');
  
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
  })
  .catch(error => {
    console.error('User info error:', error);
    localStorage.removeItem('chat_token');
    window.location.href = '/login';
  });
  
  // Join default room
  socket.emit('joinRoom', { room: 'general' });
  
  // Send message handler
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  
  function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
      socket.emit('chatMessage', message);
      messageInput.value = '';
    }
  }
  
  // Receive messages
  socket.on('message', (msg) => {
    addMessageToChat(msg);
  });
  
  // Add message to UI
  function addMessageToChat(msg) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    const timestamp = new Date(msg.timestamp).toLocaleTimeString();
    messageElement.innerHTML = `
      <div class="message-header">
        <span class="username">${msg.username}</span>
        <span class="timestamp">${timestamp}</span>
      </div>
      <div class="message-text">${msg.text}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
  
  // Update online users list
  function updateOnlineUsers(users) {
    onlineUsersList.innerHTML = '';
    users.forEach(user => {
      const li = document.createElement('li');
      li.textContent = user;
      onlineUsersList.appendChild(li);
    });
  }
  
  // Logout handler
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('chat_token');
    window.location.href = '/login';
  });
});
import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template
from flask_socketio import SocketIO, send

app = Flask(__name__)
app.config['SECRET_KEY'] = 'hashdoaflkadf'  # Replace with a secure key

# Initialize SocketIO with Redis message queue.
# This allows multiple processes/instances to share messages via Redis:contentReference[oaicite:2]{index=2}.
socketio = SocketIO(
    app,
    cors_allowed_origins='*',
    message_queue='redis://localhost:6379',  # Redis broker
    async_mode='eventlet'
)

@app.route('/')
def index():
    # Serve the chat client page
    return render_template('index.html')

@socketio.on('message')
def handle_message(msg):
    """
    Handle incoming messages from a client.
    Broadcast the message to all connected clients (including sender).
    """
    print('Received message:', msg)
    # Use broadcast=True to send to all clients (global chat):contentReference[oaicite:3]{index=3}.
    send(msg, broadcast=True)

if __name__ == '__main__':
    # Start the Flask-SocketIO server. By default this uses eventlet (if installed).
    socketio.run(app, host='0.0.0.0', port=5000)

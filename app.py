from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import redis.asyncio as redis
import asyncio
from fastapi.responses import HTMLResponse

app = FastAPI()
redis_client = redis.Redis()

CHANNEL = "chatroom"
connected_clients = []

@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html>
    <body>
      <h2>Chatroom</h2>
      <input id="msgInput" placeholder="Type a message" />
      <button onclick="sendMessage()">Send</button>
      <ul id="chat"></ul>

      <script>
        const ws = new WebSocket("ws://" + location.host + "/ws");

        ws.onmessage = function(event) {
          const msg = document.createElement("li");
          msg.innerText = event.data;
          document.getElementById("chat").appendChild(msg);
        };

        function sendMessage() {
          const input = document.getElementById("msgInput");
          ws.send(input.value);
          input.value = '';
        }
      </script>
    </body>
    </html>
    """

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(CHANNEL)

    async def send_messages():
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"].decode()
                await broadcast(data)

    async def receive_messages():
        try:
            while True:
                data = await websocket.receive_text()
                await redis_client.publish(CHANNEL, data)
        except WebSocketDisconnect:
            connected_clients.remove(websocket)
            await websocket.close()

    await asyncio.gather(send_messages(), receive_messages())

async def broadcast(message: str):
    for client in connected_clients:
        await client.send_text(message)
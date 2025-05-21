# Redis

## Run Redis server

Install and start Redis locally (default port 6379). For example, on Ubuntu you can use ```sudo apt install redis-server``` and run ```redis-server```, or on macOS use ```brew install redis``` then ```brew services start redis```. The Flask-SocketIO server will connect to Redis via the URL redis://localhost:6379 (as shown below) to publish/subscribe messages
In another terminal tab, you can test with:```redis-cli ping```

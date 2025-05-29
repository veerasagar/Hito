# Hito
A chatroom using Redis

# Installation
## Install Redis server

Install redis in fedora as 
```bash 
sudo dnf install redis
``` 
You can check the installation by running 
```bash 
redis-cli ping
``` 
Later start the server by 
```bash 
sudo systemctl start redis
```

## Install python packages

Create a virtual environment and run 
```bash 
pip install -r requirements.txt
```
Run the project by

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```



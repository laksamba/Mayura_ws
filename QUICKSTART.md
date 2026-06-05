# Quick Start - WebSocket Server

## 1️⃣ Local Setup (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env and add NEXTAUTH_SECRET from main app
nano .env
# Add: NEXTAUTH_SECRET=<your-secret-from-main-app>

# 4. Start server
npm run dev
```

**Expected output:**
```
✨ WebSocket Server Ready
   ws://0.0.0.0:3001/ws
   Broadcast: http://0.0.0.0:3001/broadcast
```

## 2️⃣ Test Connection

**In browser console (while main app is running):**

```javascript
// 1. Get auth token from main app
const response = await fetch('http://localhost:3000/api/auth/ws-token')
const { token } = await response.json()

// 2. Connect to WebSocket
const ws = new WebSocket(`ws://localhost:3001/ws?token=${token}`)

// 3. Test
ws.onopen = () => {
  console.log('✅ Connected to WebSocket!')
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'test' }))
}

ws.onmessage = (event) => console.log('📨 Message:', event.data)
ws.onerror = (error) => console.log('❌ Error:', error)
```

## 3️⃣ Production Deployment (15 minutes)

### Using Railway (easiest):

1. Push code to GitHub (if not already)
2. Go to [railway.app](https://railway.app)
3. Create new project → Connect GitHub
4. Set **Root Directory** to `/websocket-server`
5. Add env var: `NEXTAUTH_SECRET=<your-secret>`
6. Deploy
7. Copy the public URL (e.g., `wss://xxx.railway.app`)
8. Update main app in Vercel:
   - Set `NEXT_PUBLIC_WS_URL=wss://xxx.railway.app`
   - Redeploy

**Done! ✅**

## 📁 File Structure

```
websocket-server/
├── index.js              ← Main server (482 lines)
├── package.json          ← Dependencies
├── .env.example          ← Config template
├── .gitignore            ← Git ignore
├── Dockerfile            ← Container config
├── docker-compose.yml    ← Local Docker setup
├── README.md             ← Full documentation
├── DEPLOYMENT.md         ← Deployment guide
└── QUICKSTART.md         ← This file
```

## 🔧 Common Commands

```bash
# Development
npm run dev

# Production
npm start

# Docker
docker build -t websocket .
docker run -p 3001:3001 -e NEXTAUTH_SECRET=xxx websocket

# Docker Compose (with volumes for local dev)
docker-compose up
```

## 🚀 Key Features

✅ Standalone - runs independently from main app  
✅ JWT Token validation - secure authentication  
✅ Connection pooling - IP & tenant limits  
✅ Heartbeat monitoring - detects dead connections  
✅ Broadcasting - real-time updates  
✅ Graceful shutdown - clean process termination  

## ⚙️ Configuration

The server needs **only 1 secret** to work:

```env
NEXTAUTH_SECRET=your-secret-from-main-app
```

Get it from your main app's `.env`:
```bash
# From main app root
grep NEXTAUTH_SECRET .env
```

## 📊 Monitoring

**Check if server is running:**
```bash
curl http://localhost:3001
# Response: WebSocket Server Running
```

**View logs:**
```bash
npm run dev
# or
docker logs websocket-server
```

**Performance:**
- Max connections: 100 per tenant, 20 per IP
- Max payload: 256 KB
- Heartbeat: Every 30 seconds

## 🔗 How It Works

1. **Frontend calls** `/api/auth/ws-token` on main app → gets JWT
2. **Frontend connects** to `NEXT_PUBLIC_WS_URL` with token in query
3. **Server validates** token using `NEXTAUTH_SECRET`
4. **Server accepts** connection and adds to pool
5. **Frontend sends** subscribe messages
6. **Server broadcasts** real-time updates to subscribed clients

## 📝 Architecture

**No code changes needed in main app!**

The frontend already checks `NEXT_PUBLIC_WS_URL` environment variable.

```typescript
// src/lib/websocket/client.ts (unchanged)
const url = process.env.NEXT_PUBLIC_WS_URL || 
            `${protocol}//${window.location.host}/ws`
```

Just set the env var and it works ✅

## 🆘 Troubleshooting

| Issue | Fix |
|-------|-----|
| Connection refused | Check server running: `netstat -an \| grep 3001` |
| Invalid token | Verify `NEXTAUTH_SECRET` matches main app |
| Connection limit reached | Increase limits in `index.js` or reduce client connections |
| No real-time updates | Check frontend is subscribing to channels |

---

**Next:** Read [DEPLOYMENT.md](DEPLOYMENT.md) for production setup, or [README.md](README.md) for full docs.

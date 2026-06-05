# Standalone WebSocket Server

Standalone WebSocket server for Retail Smart POS. Runs independently from the main Next.js app and handles all real-time data synchronization.

## ✨ Features

- ✅ Independent deployment (separate from main app)
- ✅ JWT token-based authentication
- ✅ Real-time data broadcasting
- ✅ Connection pooling with IP/tenant limits
- ✅ Heartbeat monitoring (detects dead connections)
- ✅ Graceful shutdown support
- ✅ Container-ready (Docker support)

## 🚀 Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```
   
   Then update `.env` with:
   - `NEXTAUTH_SECRET` (copy from your main app's `.env`)
   - `NODE_ENV=development`
   - `PORT=3001`

3. **Start the server:**
   ```bash
   npm run dev
   ```
   
   You should see:
   ```
   ✨ WebSocket Server Ready
      ws://0.0.0.0:3001/ws
      Broadcast: http://0.0.0.0:3001/broadcast
   ```

4. **Test the connection:**
   ```bash
   # In another terminal, get a WebSocket token from the main app
   curl http://localhost:3000/api/auth/ws-token
   # Response: { "token": "eyJhbGc..." }
   
   # Connect to WebSocket with token
   # ws://localhost:3001/ws?token=<your-token>
   ```

## 🔌 How Frontend Talks with This Server

### Architecture

```
┌──────────────────────────┐
│   Frontend (Vercel)      │
│                          │
│  .env:                   │
│  NEXT_PUBLIC_WS_URL=    │
│  wss://websocket-.*     │
│  railway.app            │
└────────────┬─────────────┘
             │
    1. GET /api/auth/ws-token
       (stays in main app)
             │
             ▼
   ┌─────────────────────┐
   │  Main App (Vercel)  │
   │  /api/auth/ws-token │
   │  Returns JWT token  │
   └────────────┬────────┘
                │
    2. Connect to NEXT_PUBLIC_WS_URL
       with token in query
                │
                ▼
   ┌──────────────────────────┐
   │ Standalone WS Server     │
   │ (Railway/Render/AWS)     │
   │ Port 3001                │
   │ wss://websocket-*        │
   │ railway.app              │
   └──────────────────────────┘
```

### Step-by-Step Integration

#### 1. **Frontend Gets WebSocket Token**

The main app's `/api/auth/ws-token` endpoint issues a JWT token. This stays on the main app.

```typescript
// In main app (unchanged)
// GET /api/auth/ws-token
// Returns: { "token": "eyJhbGc..." }
```

#### 2. **Frontend Connects to Standalone Server**

The frontend uses `NEXT_PUBLIC_WS_URL` environment variable to connect to the standalone server.

```typescript
// In main app frontend (use.ts)
// This file ALREADY supports NEXT_PUBLIC_WS_URL
// No code changes needed!

const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 
              `${protocol}//${window.location.host}/ws`

// Connect with token
const client = new WebSocketClient(wsUrl, token)
```

#### 3. **Environment Variable Configuration**

**For local development:**
```bash
# .env.local (or .env.development.local)
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

**For Vercel production:**
1. Deploy this standalone server to Railway/Render/AWS
2. Get the public URL (e.g., `wss://retail-websocket.railway.app`)
3. In Vercel dashboard, set environment variable:
   ```
   NEXT_PUBLIC_WS_URL=wss://retail-websocket.railway.app
   ```
4. Redeploy the main app on Vercel
5. Frontend will automatically use the standalone server ✅

## 📋 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_SECRET` | ✅ | JWT secret (copy from main app) |
| `NODE_ENV` | ✅ | `development` or `production` |
| `PORT` | ❌ | Server port (default: 3001) |

### Connection Limits

- **Per IP**: 20 connections max
- **Per Tenant**: 100 connections max
- **Max Payload**: 256 KB
- **Heartbeat Interval**: 30 seconds

## 🐳 Docker Deployment

### Build Image

```bash
docker build -t retail-websocket:latest .
```

### Run Container

```bash
docker run -d \
  -p 3001:3001 \
  -e NEXTAUTH_SECRET=your-secret \
  -e NODE_ENV=production \
  --name websocket-server \
  retail-websocket:latest
```

## 🚀 Production Deployment

### Option 1: Railway

1. **Push to GitHub** (if not already)
2. **Connect Railway project** to this `/websocket-server` folder
3. **Set environment variables:**
   ```
   NEXTAUTH_SECRET=your-secret-from-main-app
   NODE_ENV=production
   PORT=3001
   ```
4. **Deploy** - Railway auto-detects `index.js` and `package.json`
5. **Get public URL** (e.g., `wss://retail-websocket.railway.app`)
6. **Update main app** on Vercel:
   ```
   NEXT_PUBLIC_WS_URL=wss://retail-websocket.railway.app
   ```

### Option 2: Render

1. **Create new Web Service** on Render
2. **Connect to GitHub** and select `/websocket-server` folder
3. **Set Build Command:** `npm install`
4. **Set Start Command:** `npm start`
5. **Add Environment Variables:**
   ```
   NEXTAUTH_SECRET=your-secret-from-main-app
   NODE_ENV=production
   ```
6. **Deploy**
7. **Get public URL** and update main app's `NEXT_PUBLIC_WS_URL`

### Option 3: AWS EC2

1. **SSH into EC2 instance**
2. **Install Node.js 16+:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. **Clone repository:**
   ```bash
   git clone <your-repo> /opt/websocket-server
   cd /opt/websocket-server/websocket-server
   ```
4. **Install dependencies:**
   ```bash
   npm install
   ```
5. **Create `.env`:**
   ```bash
   echo "NEXTAUTH_SECRET=your-secret" > .env
   echo "NODE_ENV=production" >> .env
   ```
6. **Setup PM2 (process manager):**
   ```bash
   sudo npm install -g pm2
   pm2 start index.js --name "websocket"
   pm2 startup
   pm2 save
   ```
7. **Setup nginx reverse proxy** (optional but recommended)

## 📊 Monitoring

### View Logs

```bash
# Local development
npm run dev

# PM2 logs (if using PM2)
pm2 logs websocket

# Docker logs
docker logs websocket-server
```

### Health Check

```bash
# Simple HTTP GET (server responds with text)
curl http://localhost:3001

# Response: WebSocket Server Running
```

## 🔐 Security Considerations

1. **NEXTAUTH_SECRET** - Keep this secret! Use Railway/Render/AWS secrets management
2. **SSL/TLS** - Use `wss://` in production, not `ws://`
3. **CORS** - Not applicable for WebSocket (uses Origin header)
4. **Token Expiry** - Tokens expire based on main app configuration
5. **Connection Limits** - Prevents DOS attacks

## 📝 API Reference

### WebSocket Connection

**URL:** `ws://localhost:3001/ws?token=<jwt-token>`

**Authentication:**
- Token must be a valid JWT from `/api/auth/ws-token`
- Token includes: `id`, `tenantId`, `mode`

**Message Format:**

```typescript
// Client subscribes to channel
{
  "type": "subscribe",
  "channel": "inventory_updates"
}

// Server broadcasts data
{
  "type": "data-change",
  "entityType": "sale",
  "action": "create",
  "data": { ... }
}
```

### HTTP Broadcast Endpoint

**URL:** `POST http://localhost:3001/broadcast`

**Usage (from main app backend):**

```javascript
// Send real-time update to all clients in a tenant
const response = await fetch('http://websocket-server:3001/broadcast', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'data-change',
    tenantId: 'tenant-123',
    entityType: 'sale',
    action: 'create',
    data: { id: '123', amount: 5000 }
  })
})

const result = await response.json()
// { success: true, clients: 5 }
```

## 🐛 Troubleshooting

### WebSocket Connection Refused

```
Error: WebSocket connection refused
```

**Solutions:**
1. Check standalone server is running: `ps aux | grep node`
2. Check port is listening: `netstat -an | grep 3001`
3. Check firewall allows port 3001
4. Verify `NEXT_PUBLIC_WS_URL` is set correctly

### Invalid Token Error

```
Error: Invalid token
```

**Solutions:**
1. Verify `NEXTAUTH_SECRET` matches main app
2. Check token is not expired
3. Verify token format: `Authorization: Bearer <token>`

### Connection Limit Exceeded

```
Error: IP limit reached / Tenant limit reached
```

**Solutions:**
1. Increase `MAX_CONNECTIONS_PER_IP` in `index.js`
2. Increase `MAX_CONNECTIONS_PER_TENANT` in `index.js`
3. Check for connection leaks in frontend code

## 📚 Related Files

- Main app WebSocket client: `src/lib/websocket/client.ts`
- Main app token endpoint: `src/app/api/auth/ws-token/route.ts`
- Main app Next.js server: `server.ts`
- Environment variables: `.env.example` (in main app root)

## 🤝 Support

For issues or questions, check:
1. This README
2. WebSocket client implementation: `src/lib/websocket/`
3. Main app server.ts file

# WebSocket Server - Deployment Guide

## 📍 Where Does This Server Run?

Your application will have **2 separate deployments:**

```
┌─────────────────────────────────┐
│  MAIN APP (Vercel)              │
│  - Next.js application          │
│  - API endpoints                │
│  - Web UI                       │
│  - Token generation endpoint    │
└─────────────────────────────────┘
              │
              │ (Gets token from /api/auth/ws-token)
              │
              ▼
┌─────────────────────────────────┐
│  WEBSOCKET SERVER (Railway/     │
│  Render/AWS)                    │
│  - Real-time data sync          │
│  - Connection management        │
│  - Broadcasting                 │
└─────────────────────────────────┘
```

## 🚀 Deployment Steps

### Step 1: Deploy Standalone WebSocket Server

Choose your platform:

#### **Option A: Railway (RECOMMENDED - Easiest)**

1. Go to [railway.app](https://railway.app)
2. Create new project
3. Select "Deploy from GitHub"
4. Connect your repo
5. In project settings, set **Root Directory**: `/websocket-server`
6. Add environment variables:
   ```
   NEXTAUTH_SECRET = <copy from your main app>
   NODE_ENV = production
   PORT = 3001
   ```
7. Deploy
8. ✅ Get the public URL (e.g., `wss://retail-websocket.railway.app`)

#### **Option B: Render**

1. Go to [render.com](https://render.com)
2. Create new **Web Service**
3. Connect GitHub repo
4. Set:
   - **Root Directory**: `websocket-server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add environment variables:
   ```
   NEXTAUTH_SECRET = <copy from your main app>
   NODE_ENV = production
   ```
6. Deploy
7. ✅ Get the public URL (e.g., `wss://retail-websocket.onrender.com`)

#### **Option C: Docker on AWS EC2**

1. Build Docker image:
   ```bash
   docker build -t retail-websocket:latest websocket-server/
   ```

2. Push to ECR or Docker Hub

3. Run on EC2:
   ```bash
   docker run -d \
     -p 3001:3001 \
     -e NEXTAUTH_SECRET=your-secret \
     -e NODE_ENV=production \
     --restart always \
     --name websocket-server \
     retail-websocket:latest
   ```

4. ✅ Get the public URL of your EC2 instance

### Step 2: Update Main App Configuration

Now tell your main app where the WebSocket server is:

1. **Go to Vercel Dashboard**
2. **Select your main app project**
3. **Settings → Environment Variables**
4. **Add new variable:**
   ```
   Name: NEXT_PUBLIC_WS_URL
   Value: wss://your-websocket-server-url.com
   
   Example:
   - Railway: wss://retail-websocket.railway.app
   - Render: wss://retail-websocket.onrender.com
   - AWS: wss://ec2-instance-ip.compute.amazonaws.com
   ```
5. **Redeploy** the main app

### Step 3: Verify Connection

1. **Wait for main app redeploy** on Vercel (usually 2-3 minutes)
2. **Open your app** in browser
3. **Check DevTools → Network:**
   - Look for `websocket-server-url.com` connection
   - Status should be `101 Switching Protocols` (good!) or `200` (fallback to polling, still works)
4. **Test real-time features** (POS, inventory sync, etc.)

## 🔍 How Frontend Connects (Auto Magic)

**No code changes needed!** The frontend already supports `NEXT_PUBLIC_WS_URL`.

Here's what happens:

```typescript
// Frontend code (src/lib/websocket/client.ts)
const getDefaultUrl = () => {
  // Check if NEXT_PUBLIC_WS_URL is set
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL  // ← Uses standalone server!
  }
  
  // Fallback to same-host connection
  return `${protocol}//${window.location.host}/ws`
}

// When connecting:
// 1. Call /api/auth/ws-token (on main app) → get JWT
// 2. Connect to getDefaultUrl() with JWT
// 3. Done!
```

## 📋 Configuration Checklist

**Before Deployment:**
- [ ] Copy `NEXTAUTH_SECRET` from main app `.env`
- [ ] Choose deployment platform (Railway/Render/AWS)
- [ ] Have GitHub repo with `/websocket-server` folder

**After Deploying WebSocket Server:**
- [ ] Get public URL (e.g., `wss://xxx.railway.app`)
- [ ] Verify server is running (visit URL in browser)
- [ ] Copy `NEXTAUTH_SECRET` to WebSocket server config

**After Updating Main App:**
- [ ] Add `NEXT_PUBLIC_WS_URL` to Vercel
- [ ] Redeploy main app
- [ ] Test WebSocket connection

## 🧪 Testing

### Test 1: WebSocket Server is Running

```bash
# Should return "WebSocket Server Running"
curl https://your-websocket-server.com/
```

### Test 2: Get Auth Token

```bash
# From your main app
curl https://your-main-app.vercel.app/api/auth/ws-token
# Response: {"token": "eyJhbGc..."}
```

### Test 3: Connect to WebSocket

```bash
# In browser console
const url = 'wss://your-websocket-server.com/ws?token=eyJhbGc...'
const ws = new WebSocket(url)

ws.onopen = () => console.log('✅ Connected!')
ws.onmessage = (e) => console.log('📨', e.data)
ws.onerror = (e) => console.log('❌ Error:', e)
```

## 🆘 Troubleshooting

### ❌ "WebSocket connection refused"

**Check:**
- [ ] WebSocket server is deployed and running
- [ ] URL is correct in `NEXT_PUBLIC_WS_URL`
- [ ] URL uses `wss://` for HTTPS
- [ ] No firewall blocking port

### ❌ "Invalid token error"

**Check:**
- [ ] `NEXTAUTH_SECRET` matches between main app and WebSocket server
- [ ] Token is fresh (not expired)
- [ ] Frontend is calling `/api/auth/ws-token` first

### ❌ "Connection works but no real-time updates"

**Check:**
- [ ] Main app is broadcasting to correct URL
- [ ] Broadcasting endpoint is: `http://websocket-server:3001/broadcast` (internal)
- [ ] Or from frontend: WebSocket message format is correct

### ❌ "WebSocket server using tons of memory"

**Check:**
- [ ] Connection limits not reached
- [ ] Clients are properly disconnecting
- [ ] No broadcast loops
- [ ] Monitor with: `docker stats` or `ps aux`

## 🔄 Local Development Testing

To test both locally before deploying:

```bash
# Terminal 1: Main app
cd /path/to/main-app
npm run dev
# Runs on http://localhost:3000

# Terminal 2: WebSocket server
cd /path/to/websocket-server
npm run dev
# Runs on http://localhost:3001

# Add to main app .env.local
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws

# Test in browser at http://localhost:3000
```

## 📚 Quick Reference

| Component | Location | Role |
|-----------|----------|------|
| Main App | Vercel | Web UI, API endpoints, token generation |
| WebSocket Server | Railway/Render/AWS | Real-time data, connections, broadcasting |
| Token | Main App `/api/auth/ws-token` | JWT for WebSocket authentication |
| Config | `NEXT_PUBLIC_WS_URL` | Tells frontend where WebSocket server is |

## 🎯 Success Indicators

✅ **Setup is working if:**
1. WebSocket server responds to HTTP requests
2. Main app redeploys with `NEXT_PUBLIC_WS_URL` set
3. Browser console shows WebSocket connection (not 403 error)
4. Real-time features work (POS, inventory, etc.)

---

**Questions?** Check the README.md in this folder for more details.

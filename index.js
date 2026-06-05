
/**
 * Standalone WebSocket Server for Retail Smart POS
 * * This server runs independently from the main Next.js app
 * Listens for WebSocket connections and broadcasts real-time updates
 */

import 'dotenv/config'
import { createServer } from 'http'
import { URL } from 'url'
import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'

// Configuration
const PORT = process.env.PORT || 3001
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET
const NODE_ENV = process.env.NODE_ENV || 'development'

if (!NEXTAUTH_SECRET) {
  console.error('❌ FATAL: NEXTAUTH_SECRET is required')
  process.exit(1)
}

// Connection tracking
const clients = new Map()
const connectionsByIp = new Map()
const connectionsByTenant = new Map()

const MAX_CONNECTIONS_PER_IP = 20
const MAX_CONNECTIONS_PER_TENANT = 100

console.log(`🚀 Starting WebSocket Server (${NODE_ENV})`)
console.log(`📡 Listening on port ${PORT}`)

// Create HTTP server
const server = createServer((req, res) => {
  // Catch the broadcast endpoint cleanly inside the main handler
  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const message = JSON.parse(body)
        const count = broadcastToTenant(message.tenantId, message)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, clients: count }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message }))
      }
    })
    return
  }

  // Fallback default response
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('WebSocket Server Running\n')
})

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: false,
  maxPayload: 256 * 1024 // 256 KB
})

/**
 * Authenticate client using JWT token
 */
function authenticateClient(token, ip) {
  try {
    const decoded = jwt.verify(token, NEXTAUTH_SECRET)
    
    // Check IP limit
    const ipCount = connectionsByIp.get(ip) || 0
    if (ipCount >= MAX_CONNECTIONS_PER_IP) {
      console.warn(`⚠️  IP limit reached: ${ip}`)
      return null
    }

    // Check tenant limit
    if (decoded.tenantId) {
      const tenantCount = connectionsByTenant.get(decoded.tenantId) || 0
      if (tenantCount >= MAX_CONNECTIONS_PER_TENANT) {
        console.warn(`⚠️  Tenant limit reached: ${decoded.tenantId}`)
        return null
      }
    }

    return decoded
  } catch (error) {
    console.error(`❌ Auth failed: ${error.message}`)
    return null
  }
}

/**
 * Handle new WebSocket connection
 */
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown'
  
  // Get token from query
  const url = new URL(req.url, `http://${req.headers.host}`)
  const token = url.searchParams.get('token')

  if (!token) {
    ws.close(1008, 'Missing token')
    return
  }

  // Authenticate
  const decoded = authenticateClient(token, ip)
  if (!decoded) {
    ws.close(1008, 'Invalid token')
    return
  }

  // Register client
  const clientId = decoded.id || decoded.sub || 'unknown'
  const client = {
    ws,
    userId: clientId,
    tenantId: decoded.tenantId,
    mode: decoded.mode || 'tenant',
    ip,
    subscriptions: new Set(),
    isAlive: true
  }

  clients.set(ws, client)
  connectionsByIp.set(ip, (connectionsByIp.get(ip) || 0) + 1)
  if (decoded.tenantId) {
    connectionsByTenant.set(decoded.tenantId, (connectionsByTenant.get(decoded.tenantId) || 0) + 1)
  }

  console.log(`✅ Client connected: ${clientId} (${decoded.tenantId || 'account'} mode)`)

  // Handle heartbeat
  ws.on('pong', () => {
    client.isAlive = true
  })

  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data)
      
      if (message.type === 'subscribe') {
        client.subscriptions.add(message.channel)
        console.log(`📢 User ${clientId} subscribed to: ${message.channel}`)
      } else if (message.type === 'unsubscribe') {
        client.subscriptions.delete(message.channel)
        console.log(`📢 User ${clientId} unsubscribed from: ${message.channel}`)
      }
    } catch (error) {
      console.error(`❌ Error processing message: ${error.message}`)
    }
  })

  // Handle close
  ws.on('close', () => {
    clients.delete(ws)
    connectionsByIp.set(ip, Math.max(0, (connectionsByIp.get(ip) || 1) - 1))
    if (decoded.tenantId) {
      connectionsByTenant.set(decoded.tenantId, Math.max(0, (connectionsByTenant.get(decoded.tenantId) || 1) - 1))
    }
    console.log(`❌ Client disconnected: ${clientId}`)
  })

  // Handle errors
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error: ${error.message}`)
  })
})

/**
 * Heartbeat to detect dead connections
 */
setInterval(() => {
  clients.forEach((client, ws) => {
    if (!client.isAlive) {
      ws.terminate()
      return
    }
    client.isAlive = false
    ws.ping()
  })
}, 30000)

/**
 * Broadcast message to clients in tenant/account
 */
function broadcastToTenant(tenantId, message) {
  let count = 0
  clients.forEach((client, ws) => {
    if (client.mode === 'tenant' && client.tenantId === tenantId) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message))
        count++
      }
    }
  })
  return count
}

function broadcastToAccount(message) {
  let count = 0
  clients.forEach((client, ws) => {
    if (client.mode === 'account') {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message))
        count++
      }
    }
  })
  return count
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✨ WebSocket Server Ready`)
  console.log(`   ws://0.0.0.0:${PORT}/ws`)
  console.log(`   Broadcast: http://0.0.0.0:${PORT}/broadcast\n`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down gracefully...')
  wss.clients.forEach(ws => ws.close())
  server.close(() => {
    console.log('✅ Server closed')
    process.exit(0)
  })
})
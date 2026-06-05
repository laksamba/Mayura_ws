/**
 * Standalone WebSocket Server for Retail Smart POS
 *
 * This server runs independently from the main Next.js app
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
 * Returns decoded payload on success, or { error: string } on failure
 */
function authenticateClient(token, ip) {
  try {
    const decoded = jwt.verify(token, NEXTAUTH_SECRET)

    // Check IP limit
    const ipCount = connectionsByIp.get(ip) || 0
    if (ipCount >= MAX_CONNECTIONS_PER_IP) {
      console.warn(`⚠️  IP limit reached: ${ip}`)
      return { error: 'IP_LIMIT' }
    }

    // Check tenant limit
    if (decoded.tenantId) {
      const tenantCount = connectionsByTenant.get(decoded.tenantId) || 0
      if (tenantCount >= MAX_CONNECTIONS_PER_TENANT) {
        console.warn(`⚠️  Tenant limit reached: ${decoded.tenantId}`)
        return { error: 'TENANT_LIMIT' }
      }
    }

    return decoded
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.warn(`⚠️  Token expired for IP ${ip}`)
      return { error: 'TOKEN_EXPIRED' }
    }
    console.error(`❌ Auth failed: ${error.message}`)
    return { error: 'INVALID_TOKEN' }
  }
}

/**
 * Register a decoded JWT as an authenticated client
 */
function registerClient(client, ws, decoded, ip, source) {
  const clientId = decoded.id || decoded.sub || 'unknown'
  client.userId = clientId
  client.tenantId = decoded.tenantId
  client.mode = decoded.mode || 'tenant'
  client.authenticated = true

  clients.set(ws, client)
  connectionsByIp.set(ip, (connectionsByIp.get(ip) || 0) + 1)
  if (decoded.tenantId) {
    connectionsByTenant.set(decoded.tenantId, (connectionsByTenant.get(decoded.tenantId) || 0) + 1)
  }
  console.log(`✅ Client authenticated (${source}): ${clientId} (${decoded.tenantId || 'account'} mode)`)
}

/**
 * Handle auth result — send error or close as appropriate
 */
function handleAuthFailure(ws, result) {
  if (result.error === 'TOKEN_EXPIRED') {
    ws.send(JSON.stringify({ type: 'error', code: 'TOKEN_EXPIRED', message: 'Token expired, please refresh and reconnect' }))
    ws.close(1008, 'Token expired')
  } else if (result.error === 'IP_LIMIT' || result.error === 'TENANT_LIMIT') {
    ws.send(JSON.stringify({ type: 'error', code: result.error, message: 'Connection limit reached' }))
    ws.close(1008, 'Connection limit reached')
  } else {
    ws.close(1008, 'Invalid token')
  }
}

/**
 * Handle new WebSocket connection
 */
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown'

  // Query token — lower priority fallback if no message-based auth arrives
  const url = new URL(req.url, `http://${req.headers.host}`)
  const queryToken = url.searchParams.get('token')

  const client = {
    ws,
    userId: 'pending',
    tenantId: undefined,
    mode: 'tenant',
    ip,
    subscriptions: new Set(),
    isAlive: true,
    authenticated: false
  }

  // Schedule query token as fallback — fires after 100ms,
  // allowing the client's onopen authenticate message to arrive first (takes priority).
  let queryAuthTimer = null
  if (queryToken) {
    queryAuthTimer = setTimeout(() => {
      if (client.authenticated) return // message token already handled it
      const result = authenticateClient(queryToken, ip)
      if (result.error) {
        handleAuthFailure(ws, result)
        return
      }
      registerClient(client, ws, result, ip, 'query token fallback')
    }, 100)
  }

  // Handle heartbeat
  ws.on('pong', () => {
    client.isAlive = true
  })

  // Handle messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data)

      // Handle authenticate message — PRIMARY auth method (takes priority over query token)
      if (message.type === 'authenticate' && message.token) {
        if (client.authenticated) {
          ws.send(JSON.stringify({ type: 'authenticated', clientId: client.userId }))
          return
        }

        // Cancel the query token fallback — message auth takes priority
        if (queryAuthTimer) {
          clearTimeout(queryAuthTimer)
          queryAuthTimer = null
        }

        const result = authenticateClient(message.token, ip)
        if (result.error) {
          handleAuthFailure(ws, result)
          return
        }

        registerClient(client, ws, result, ip, 'message token')
        ws.send(JSON.stringify({ type: 'authenticated', clientId: client.userId }))
        return
      }

      // Reject other messages if not authenticated
      if (!client.authenticated) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated', code: 'AUTH_REQUIRED' }))
        return
      }

      if (message.type === 'subscribe') {
        const channels = Array.isArray(message.channels) ? message.channels : [message.channel]
        channels.forEach(ch => client.subscriptions.add(ch))
        console.log(`📢 User ${client.userId} subscribed to: ${channels.join(', ')}`)
      } else if (message.type === 'unsubscribe') {
        const channels = Array.isArray(message.channels) ? message.channels : [message.channel]
        channels.forEach(ch => client.subscriptions.delete(ch))
        console.log(`📢 User ${client.userId} unsubscribed from: ${channels.join(', ')}`)
      } else if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
      }
    } catch (error) {
      console.error(`❌ Error processing message: ${error.message}`)
    }
  })

  // Handle close
  ws.on('close', () => {
    if (queryAuthTimer) clearTimeout(queryAuthTimer)
    clients.delete(ws)
    connectionsByIp.set(ip, Math.max(0, (connectionsByIp.get(ip) || 1) - 1))
    if (client.tenantId) {
      connectionsByTenant.set(client.tenantId, Math.max(0, (connectionsByTenant.get(client.tenantId) || 1) - 1))
    }
    console.log(`❌ Client disconnected: ${client.userId}`)
  })

  // Handle errors
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error (${client.userId}): ${error.message}`)
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
 * Broadcast message to clients in a tenant
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
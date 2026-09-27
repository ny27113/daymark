import http from 'node:http'
import crypto from 'node:crypto'

const port = Number(process.env.PORT || 8787)
const aiApiUrl = process.env.AI_API_URL
const aiApiKey = process.env.AI_API_KEY
const allowedOrigin = process.env.ALLOWED_ORIGIN
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID
const localDevAuth = process.env.LOCAL_DEV_AUTH === 'true'
const accessPasswordHash = process.env.ACCESS_PASSWORD_HASH || ''
const accessSessionSecret = process.env.ACCESS_SESSION_SECRET || ''
const allowedEmailDomains = ['nyu.edu', 'aischennai.org', 'proton.me']
const ownerUid = 'CT4Um9yffCe8IcsWSohL4GRSdKf1'
const wordpressBulletinUrl = process.env.WORDPRESS_BULLETIN_URL
const rateLimit = new Map()
let adminAuth
let adminDb

if (firebaseProjectId) {
  try {
    const { getApps, initializeApp } = await import('firebase-admin/app')
    const { getAuth } = await import('firebase-admin/auth')
    const { getFirestore } = await import('firebase-admin/firestore')
    const app = getApps().length ? getApps()[0] : initializeApp()
    adminAuth = getAuth(app)
    adminDb = getFirestore(app)
  } catch (error) {
    console.error('Firebase Admin could not initialize:', error.message)
  }
}

function json(response, status, body, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(origin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Daymark-Access, X-Daymark-Session',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Vary': 'Origin',
    } : {}),
  })
  response.end(JSON.stringify(body))
}

function clientIp(request) {
  return request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown'
}

function withinRateLimit(request) {
  const now = Date.now()
  const key = clientIp(request)
  const current = rateLimit.get(key)
  if (!current || now - current.startedAt > 60_000) {
    rateLimit.set(key, { startedAt: now, count: 1 })
    return true
  }
  current.count += 1
  return current.count <= 30
}

function accessEnabled() {
  return Boolean(accessPasswordHash && accessSessionSecret)
}

function derivePassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex')
}

function issueAccessToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url')
  const signature = crypto.createHmac('sha256', accessSessionSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function hasValidAccessToken(request) {
  if (!accessEnabled()) return true
  const [payload, signature] = (request.headers['x-daymark-access'] || '').split('.')
  if (!payload || !signature) return false
  const expected = crypto.createHmac('sha256', accessSessionSecret).update(payload).digest('base64url')
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now()
  } catch {
    return false
  }
}

async function authenticate(request) {
  if (localDevAuth && !firebaseProjectId && !adminAuth) return { uid: ownerUid }
  if (!adminAuth) return null
  const authorization = request.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return null
  try {
    const user = await adminAuth.verifyIdToken(token)
    const email = (user.email || '').toLowerCase()
    if (user.uid !== ownerUid || user.email_verified !== true || !allowedEmailDomains.some((domain) => email.endsWith(`@${domain}`))) return null
    return user
  } catch {
    return null
  }


}

async function hasActiveSession(request, user) {
    if (!adminDb) return true
    const sessionId = request.headers['x-daymark-session']
    if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(sessionId)) return false
    const snapshot = await adminDb.doc(`users/${user.uid}/sessions/${sessionId}`).get()
    const data = snapshot.data()
    return snapshot.exists && data?.uid === user.uid && data.revoked !== true
  }
function fallbackBrief(tasks = [], schedule = []) {
  const openTasks = tasks.filter((task) => !task.done)
  const first = schedule[0] || openTasks[0]
  const highPriority = openTasks.filter((task) => task.priority === 'High').length
  const focus = first ? `Start with ${first.title} for ${first.duration || 30} minutes.` : 'Use the first open block for a meaningful task.'
  return {
    text: `${focus} ${highPriority ? `You have ${highPriority} high-priority task${highPriority === 1 ? '' : 's'} to protect.` : 'Keep the plan light and finish one thing before adding another.'}`,
    source: 'rules',
  }
}

async function readBody(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 100_000) throw new Error('Request is too large.')
  }
  return JSON.parse(body || '{}')
}

async function createBrief(payload) {
  if (!aiApiUrl || !aiApiKey) return fallbackBrief(payload.tasks, payload.schedule)
  const upstream = await fetch(aiApiUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + aiApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'Write a concise, supportive daily student brief in two sentences. Do not invent deadlines or facts. Return plain text only.' },
        { role: 'user', content: JSON.stringify({ tasks: payload.tasks, schedule: payload.schedule }) },
      ],
    }),
  })
  if (!upstream.ok) throw new Error(`AI provider returned ${upstream.status}.`)
  const data = await upstream.json()
  const text = data.choices?.[0]?.message?.content || data.output_text
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI provider returned no brief.')
  return { text: text.trim(), source: 'server-ai' }
}

const server = http.createServer(async (request, response) => {
  const requestOrigin = request.headers.origin
  if (allowedOrigin && requestOrigin && requestOrigin !== allowedOrigin) return json(response, 403, { error: 'Origin is not allowed.' })
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': requestOrigin || allowedOrigin || '',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Daymark-Access, X-Daymark-Session',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Vary': 'Origin',
    })
    return response.end()
  }
  if (request.method === 'GET' && request.url === '/api/access/status') {
    return json(response, 200, { enabled: accessEnabled(), valid: hasValidAccessToken(request) }, requestOrigin)
  }
  if (request.method === 'POST' && request.url === '/api/access/verify') {
    if (!withinRateLimit(request)) return json(response, 429, { error: 'Too many attempts. Try again shortly.' }, requestOrigin)
    try {
      if (!accessEnabled()) return json(response, 503, { error: 'Access password is not configured.' }, requestOrigin)
      const payload = await readBody(request)
      if (typeof payload.password !== 'string' || payload.password.length < 1 || payload.password.length > 256) {
        return json(response, 400, { error: 'A password is required.' }, requestOrigin)
      }
      const [salt, expected] = accessPasswordHash.split(':')
      const actual = derivePassword(payload.password, salt)
      const valid = expected && expected.length === actual.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
      if (!valid) return json(response, 401, { error: 'Incorrect password.' }, requestOrigin)
      return json(response, 200, { token: issueAccessToken() }, requestOrigin)
    } catch {
      return json(response, 400, { error: 'Access verification failed.' }, requestOrigin)
    }
  }
  if (request.method === 'GET' && request.url === '/api/health') return json(response, 200, { ok: true }, requestOrigin)
  if (request.method === 'GET' && request.url === '/api/bulletin') {
    if (!wordpressBulletinUrl) return json(response, 503, { error: 'Morning bulletin is not configured.' }, requestOrigin)
    try {
      if (!hasValidAccessToken(request)) return json(response, 401, { error: 'The access screen must be completed first.' }, requestOrigin)
      const user = await authenticate(request)
      if (!user) return json(response, 401, { error: 'Sign in is required.' }, requestOrigin)
      if (!(await hasActiveSession(request, user))) return json(response, 401, { error: 'An active device session is required.' }, requestOrigin)
      const upstream = await fetch(wordpressBulletinUrl, { headers: { Accept: 'application/json' } })
      if (!upstream.ok) return json(response, 502, { error: 'Morning bulletin could not be fetched.' }, requestOrigin)
      const data = await upstream.json()
      const text = Array.isArray(data) ? data.slice(0, 3).map((item) => item.title?.rendered || item.title || '').filter(Boolean).join(' / ') : ''
      return json(response, 200, { text: text || 'No bulletin items were returned.' }, requestOrigin)
    } catch {
      return json(response, 502, { error: 'Morning bulletin could not be fetched.' }, requestOrigin)
    }
  }
  if (request.method !== 'POST' || request.url !== '/api/brief') return json(response, 404, { error: 'Not found.' }, requestOrigin)
  if (!withinRateLimit(request)) return json(response, 429, { error: 'Too many requests. Try again shortly.' }, requestOrigin)
  try {
    if (!hasValidAccessToken(request)) return json(response, 401, { error: 'The access screen must be completed first.' }, requestOrigin)
    const user = await authenticate(request)
    if (!user) return json(response, 401, { error: 'Sign in is required.' }, requestOrigin)
    const payload = await readBody(request)
    if (!Array.isArray(payload.tasks) || !Array.isArray(payload.schedule) || payload.tasks.length > 100 || payload.schedule.length > 100) {
      return json(response, 400, { error: 'tasks and schedule arrays are required and limited to 100 items.' }, requestOrigin)
    }
    return json(response, 200, { ...(await createBrief(payload)), userId: user.uid }, requestOrigin)
  } catch (error) {
    return json(response, 502, { error: error instanceof Error ? error.message : 'Brief generation failed.' }, requestOrigin)
  }
})

server.listen(port, localDevAuth ? '127.0.0.1' : undefined, () => console.log(`Daymark API listening on http://localhost:${port}`))

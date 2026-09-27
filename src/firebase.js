import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

const config = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID }
export const firebaseConfigured = Object.values(config).every(Boolean)
const app = firebaseConfigured ? (getApps()[0] || initializeApp(config)) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const functions = app ? getFunctions(app) : null
export const OWNER_UID = 'CT4Um9yffCe8IcsWSohL4GRSdKf1'
export const ALLOWED_EMAIL_DOMAINS = ['nyu.edu', 'aischennai.org', 'proton.me']

export function isAllowedEmail(email) {
  const normalized = (email || '').trim().toLowerCase()
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`))
}

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase is not configured.')
  const result = await signInWithPopup(auth, googleProvider)
  if (!result.user.emailVerified || !isAllowedEmail(result.user.email) || result.user.uid !== OWNER_UID) {
    await signOut(auth)
    throw new Error('This Google account is not the Daymark owner account.')
  }
  return result
}
export async function signOutUser() {
  if (functions && auth?.currentUser) {
    try { await httpsCallable(functions, 'revokeSession')({ sessionId: getDeviceSessionId() }) } catch { /* Auth sign-out must still complete if the function is unavailable. */ }
  }
  if (auth) return signOut(auth)
}
export function watchAuthState(callback) { return auth ? onAuthStateChanged(auth, callback) : () => {} }
export async function getIdToken() {
  if (!auth?.currentUser) return null
  return auth.currentUser.getIdToken()
}
export async function saveUserData(uid, data) { if (!db) return; return setDoc(doc(db, 'users', uid), data, { merge: true }) }
export function watchCollection(uid, name, onData, onError) {
  if (!db || !uid) return () => {}
  return onSnapshot(collection(db, 'users', uid, name), (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError)
}
export async function saveCollectionItem(uid, name, id, data) {
  if (!db || !uid) return
  return setDoc(doc(db, 'users', uid, name, String(id)), {
    ...data,
    ...(data.createdAt ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}
export async function removeCollectionItem(uid, name, id) {
  if (!db || !uid) return
  return deleteDoc(doc(db, 'users', uid, name, String(id)))
}
export async function replaceCollection(uid, name, items) {
  if (!db || !uid) return
  const batch = writeBatch(db)
  items.forEach((item) => batch.set(doc(db, 'users', uid, name, String(item.id)), {
    ...item,
    ...(item.createdAt ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }, { merge: true }))
  return batch.commit()
}

const sessionStorageKey = 'daymark-session-id'
export function getDeviceSessionId() {
  let id = window.localStorage.getItem(sessionStorageKey)
  if (!id) {
    id = crypto.randomUUID().replaceAll('-', '')
    window.localStorage.setItem(sessionStorageKey, id)
  }
  return id
}
export async function registerDeviceSession() {
  if (!functions) return null
  const result = await httpsCallable(functions, 'createSession')({ sessionId: getDeviceSessionId() })
  return result.data
}
export function watchDeviceSession(uid, onRevoked) {
  if (!db || !uid) return () => {}
  return onSnapshot(doc(db, 'users', uid, 'sessions', getDeviceSessionId()), (snapshot) => {
    if (snapshot.exists() && snapshot.data().revoked === true) onRevoked()
  })
}

const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

setGlobalOptions({ maxInstances: 10 });

const app = getApps().length ? getApps()[0] : initializeApp();
const db = getFirestore(app);
const MAX_SESSIONS = 3;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ALLOWED_EMAILS = ["nyu.edu", "aischennai.org", "proton.me"];
const OWNER_UID = "CT4Um9yffCe8IcsWSohL4GRSdKf1";

function assertAllowedUser(request) {
  const user = request.auth?.token;
  const email = String(user?.email || "").toLowerCase();
  if (!request.auth || request.auth.uid !== OWNER_UID || user?.email_verified !== true ||
      !ALLOWED_EMAILS.some((domain) => email.endsWith(`@${domain}`))) {
    throw new HttpsError("permission-denied", "A verified allowlisted account is required.");
  }
  return request.auth.uid;
}

function sessionIdFrom(request) {
  const sessionId = request.data?.sessionId;
  if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(sessionId)) {
    throw new HttpsError("invalid-argument", "sessionId must be 8-128 safe characters.");
  }
  return sessionId;
}

function sessionRef(uid, sessionId) {
  return db.doc(`users/${uid}/sessions/${sessionId}`);
}

exports.createSession = onCall(async (request) => {
  const uid = assertAllowedUser(request);
  const sessionId = sessionIdFrom(request);
  const now = Timestamp.now();
  const cutoff = Timestamp.fromMillis(Date.now() - SESSION_TTL_MS);
  const userSessions = db.collection(`users/${uid}/sessions`);

  await db.runTransaction(async (transaction) => {
    const currentRef = sessionRef(uid, sessionId);
    const current = await transaction.get(currentRef);
    if (current.exists && current.data().revoked !== true
        && current.data().lastSeenAt?.toMillis?.() >= cutoff.toMillis()) {
      transaction.update(currentRef, { lastSeenAt: now });
      return;
    }

    const activeQuery = userSessions
        .where("revoked", "==", false)
        .where("lastSeenAt", ">=", cutoff)
        .orderBy("lastSeenAt", "asc")
        .limit(MAX_SESSIONS);
    const active = await transaction.get(activeQuery);
    if (active.size >= MAX_SESSIONS) {
      const oldest = active.docs[0];
      transaction.update(oldest.ref, { revoked: true, revokedAt: now });
    }
    transaction.set(currentRef, {
      uid,
      sessionId,
      createdAt: now,
      lastSeenAt: now,
      revoked: false,
    });
  });

  return { sessionId, maxSessions: MAX_SESSIONS };
});

exports.revokeSession = onCall(async (request) => {
  const uid = assertAllowedUser(request);
  const sessionId = sessionIdFrom(request);
  const ref = sessionRef(uid, sessionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { revoked: false };
  await ref.update({ revoked: true, revokedAt: Timestamp.now() });
  return { revoked: true };
});

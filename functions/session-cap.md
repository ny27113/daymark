# Trusted session-cap boundary

`createSession` and `revokeSession` in `functions/index.js` are callable
Functions backed by the Admin SDK. They require an authenticated, verified
allowlisted account and validate a bounded session identifier. Creation runs in
a Firestore transaction, ignores revoked or stale records, and keeps at most
three active sessions by revoking the oldest before writing the new record.
`revokeSession` only addresses a session below the caller's own user document.

The client must not write heartbeats or `revoked` fields directly. Firestore
rules therefore allow reads of a user's session records but deny all client
create/update/delete operations. The 30-day TTL is a cleanup/active-session
boundary; deploy a scheduled cleanup job if stale records need to be removed
physically. Any API that needs a session boundary must check the session record
server-side; an ID token alone does not prove that a particular device session
is still active.

Threat checks covered by this design:

- Unauthenticated, unverified, or non-allowlisted callers are rejected.
- A caller cannot create a session for another UID because the UID comes from
  the verified callable context.
- A caller cannot set `revoked`, timestamps, or arbitrary fields; Admin writes
  the complete server-owned shape.
- Concurrent fourth-device registrations are serialized by the transaction.
- Revoked and stale records do not consume an active slot.

# Daymark — life dashboard

A Vite + React dashboard for a high-school junior: a calm daily view, rapid task capture, deterministic scheduling, classes, goals, routines, weekly review, and copy-ready export. It is intentionally a sibling app; `nyu-clubs/` is untouched.

## Run locally

```bash
npm install
npm run dev
```

Without Firebase variables, the header clearly shows **Local demo mode**. Tasks and controls work in memory only; nothing claims to persist. Copy `.env.example` to `.env.local` and fill `VITE_FIREBASE_*` to enable Google sign-in and Firestore helpers.

Run the optional server endpoint in a second terminal:

```bash
npm run server
```

When `ACCESS_PASSWORD_HASH` and `ACCESS_SESSION_SECRET` are configured, the
browser must complete the first-load access screen before the dashboard is
rendered. The password is checked by the server using scrypt and the browser
receives only a temporary signed session token. This is an additional beta
access gate, not a replacement for Firebase Authentication.

To have CodeRabbit review this project, push `life-dashboard/` to a GitHub
repository and install the CodeRabbit GitHub App on that repository. The
included `.coderabbit.yaml` configures security-focused review paths. The
`coderabbitai/cursor-plugin` reference is a Cursor plugin and must not be
bundled into the website.

Vite proxies `/api/*` to that server during development. `POST /api/brief` accepts the current tasks and generated schedule and returns a short brief. With no model variables configured it uses the free deterministic fallback. If you deploy the API separately (for example on Cloud Run), set the public API origin in the frontend build as `VITE_API_BASE_URL=https://your-api.example.com`; leave it empty for local Vite proxying. Configure `AI_API_URL` and `AI_API_KEY` in the server environment only; these values are never bundled into the frontend. `.env.local` and all other local env files are ignored by Git.

## Firebase setup

1. Create a separate Firebase project and register a Web app.
2. Enable Google under Authentication → Sign-in providers and add `localhost` to authorized domains. Only `@nyu.edu`, `@aischennai.org`, and `@proton.me` accounts are permitted.
3. Add the six `VITE_FIREBASE_*` values to `.env.local` (never commit credentials).
4. Deploy rules from this folder with `firebase deploy --only firestore:rules` after selecting the isolated project.
5. `src/firebase.js` scopes user data to `users/{uid}`. Deploy the Functions package for trusted session enforcement: `createSession` transactionally keeps at most three non-expired sessions and revokes the oldest when a fourth device signs in; `revokeSession` handles explicit sign-out. Client heartbeats are not a security boundary, and `/sessions` is server-write-only.
6. For the protected brief endpoint, run the server with `FIREBASE_PROJECT_ID` set. In Cloud Run, use the service account's default credentials; locally, authenticate Application Default Credentials with `gcloud auth application-default login`. The server verifies Firebase ID tokens, checks the configured `ALLOWED_ORIGIN`, and rate-limits brief requests.
7. The server fails closed when Firebase Admin is unavailable. For local fallback testing only, explicitly set `LOCAL_DEV_AUTH=true`; never set it in a deployed environment.

The email-domain allowlist and verified-email requirement are enforced in the client for immediate feedback, on the server after Firebase token verification, and in Firestore rules. Deploy updated rules with:

```bash
firebase deploy --only firestore:rules
```

The rules are a prototype with ownership checks, strict schemas, bounded strings,
and create/update parity validation for tasks, schedule, deadlines, routines,
subjects, and server-managed sessions. Review the assumed models in
`firestore.rules` before enabling persistence for new fields. Validate and deploy
the backend together with:

```bash
cd functions && npm install && npm run deploy
```

Build before Hosting deployment so Firebase publishes `dist/`:

```bash
npm run build
firebase deploy --only hosting
```

## Scheduling and AI boundary

The scheduler is deterministic and explainable: priority, deadline proximity, duration, fixed class events, energy-window placeholders, and buffers produce editable blocks. The daily brief goes through the server endpoint, which defaults to a no-key rules-based response. A configured model is optional and server-only; no provider credential is exposed to the browser. The core scheduler and fallback remain free and require no credit card.

## Privacy and launch gates

- The authenticated application sends `noindex, nofollow, noarchive` metadata and `robots.txt` disallows crawling.
- `privacy.html` and `terms.html` are public static pages and include canonical metadata for the Firebase Hosting domain. Update these URLs after connecting a custom domain.
- `public/sitemap.xml` lists only the public legal pages on the Firebase Hosting domain. Update its host after connecting a custom domain.
- No analytics or non-essential cookies are included, so no cookie-consent banner is needed unless tracking is added later.
- `public/favicon.svg` is copied into the Hosting build.
- The dashboard writes tasks and subjects under the authenticated user's Firestore path. Sign-in is required for cross-device persistence.
- Each authenticated browser registers a server-managed session. The trusted Function revokes the oldest active session when a fourth device signs in, and the client signs out when its session is revoked.

## Production checks

```bash
npm run lint
npm run build
npm audit --omit=dev
grep -R "AI_API_KEY\|sk-" dist || true
```

Connect the custom domain in Firebase Hosting, then update `ALLOWED_ORIGIN`, `VITE_API_BASE_URL`, canonical URLs, and the sitemap host to match it. Use a Firebase Hosting preview channel for beta testers before the production deploy.


Code Checked with Code rabbit ![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/ny27113/daymark?utm_source=oss&utm_medium=github&utm_campaign=ny27113%2Fdaymark&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

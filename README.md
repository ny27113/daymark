# Daymark - life dashboard

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

On first load, the app presents a welcome screen and requires Google Sign-In.
Only the configured owner Firebase UID can continue to the dashboard. The
approved email-domain check remains defense in depth. Firebase Authentication
and Firestore rules remain the security boundary. An optional server-side
access gate is documented in `.env.example`, but it is not required for the
free Firebase Hosting flow.

To have CodeRabbit review this project, push `life-dashboard/` to a GitHub
repository and install the CodeRabbit GitHub App on that repository. The
included `.coderabbit.yaml` configures security-focused review paths. The
`coderabbitai/cursor-plugin` reference is a Cursor plugin and must not be
bundled into the website.

Vite proxies `/api/*` to that server during development. `POST /api/brief` accepts the current tasks and generated schedule and uses Gemini when `GEMINI_API_KEY` is configured, otherwise it uses the deterministic fallback. `POST /api/chat` provides the protected private assistant. If you deploy the API separately, set `VITE_API_BASE_URL` in the frontend build; leave it empty for local Vite proxying. Configure `GEMINI_API_KEY` and `GEMINI_MODEL` in the server environment only. These values are never bundled into the frontend. `.env.local` and all other local env files are ignored by Git.

## Firebase setup

1. Create a separate Firebase project and register a Web app.
2. Enable Google under Authentication -> Sign-in providers and add `localhost` to authorized domains. The configured owner UID is the only account authorized; the approved domains are defense in depth.
3. Add the six `VITE_FIREBASE_*` values to `.env.local` (never commit credentials).
4. Deploy rules from this folder with `firebase deploy --only firestore:rules` after selecting the isolated project.
5. `src/firebase.js` scopes user data to `users/{uid}`. Deploy the Functions package for trusted session enforcement: `createSession` transactionally keeps at most three non-expired sessions and revokes the oldest when a fourth device signs in; `revokeSession` handles explicit sign-out. Client heartbeats are not a security boundary, and `/sessions` is server-write-only.
6. For the protected brief, chat, and bulletin endpoints, run the server with `FIREBASE_PROJECT_ID` set. In Cloud Run, use the service account's default credentials; locally, authenticate Application Default Credentials with `gcloud auth application-default login`. The server verifies Firebase ID tokens, requires an active device session when Admin Firestore is available, checks the configured `ALLOWED_ORIGIN`, and rate-limits requests. Set `WORDPRESS_BULLETIN_API_URL` to the site's WordPress REST posts endpoint; the AISC bulletin site uses `https://sites.aischennai.org/hsbulletin/wp-json/wp/v2/posts`. The server requests the newest post and does not expose WordPress credentials to the browser.
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

The scheduler is deterministic and explainable: priority, deadline proximity, duration, fixed class events, energy-window placeholders, and buffers produce editable blocks. Gemini calls go through the authenticated server endpoint using the Gemini Developer API. A configured model is optional and server-only; no provider credential is exposed to the browser. Enable Firebase App Check for the web app before relying on AI quota in production, and keep the server rate limits enabled. If a Gemini key was ever pasted into a repository, terminal log, screenshot, or chat, revoke it in Google AI Studio and create a replacement before deployment.

## Privacy and launch gates

- The authenticated application sends `noindex, nofollow, noarchive` metadata and `robots.txt` disallows crawling.
- `privacy.html` and `terms.html` are static legal pages marked `noindex,nofollow,noarchive`.
- `public/sitemap.xml` intentionally contains no URLs because this is a private dashboard.
- No analytics or non-essential cookies are included, so no cookie-consent banner is needed unless tracking is added later.
- `public/favicon.svg` is copied into the Hosting build.
- The dashboard writes tasks and subjects under the authenticated user's Firestore path. Sign-in is required for cross-device persistence.
- Each authenticated browser attempts to register a server-managed session. The trusted Function revokes the oldest active session when a fourth device signs in, and the client signs out when its session is revoked. If Functions are unavailable on the Firebase Spark plan, the UI reports that the cap is not active; Firestore owner rules still protect the data.

## Production checks

```bash
npm run lint
npm run build
npm audit --omit=dev
grep -R "AI_API_KEY\|sk-" dist || true
```

Connect the custom domain in Firebase Hosting, then update `ALLOWED_ORIGIN`, `VITE_API_BASE_URL`, canonical URLs, and the sitemap host to match it. Use a Firebase Hosting preview channel for beta testers before the production deploy.


Code Checked with Code rabbit ![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/ny27113/daymark?utm_source=oss&utm_medium=github&utm_campaign=ny27113%2Fdaymark&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

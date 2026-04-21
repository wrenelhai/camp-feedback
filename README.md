# Miles of Music Camp — Feedback App

A mobile web app for recording and synthesizing camper feedback via audio interviews.

## Live deployment

| Layer | Service | URL |
|---|---|---|
| Frontend | Vercel | https://camp-feedback.vercel.app |
| Backend API | Render (free tier) | https://camp-feedback.onrender.com |
| Database | Supabase Postgres | Supabase dashboard |
| Audio storage | Supabase Storage (`recordings` bucket) | Supabase dashboard |

---

## Quick start (local dev)

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET at minimum
npm install
npm run db:push        # push schema to your database
npm run dev            # http://localhost:3001
```

> **Local dev tip:** Leave `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` blank in `.env`
> and the backend will fall back to local disk storage (`./uploads/`) and SQLite.
> Set `DATABASE_URL=file:./dev.db` for a local SQLite database.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173  (proxies /api → localhost:3001)
```

### 3. First-time admin setup

Visit **http://localhost:5173/admin/setup** and create the admin account.

### 4. Create a session

- Log in at `/admin/login`
- Click **New session** — the default 13-question set is pre-loaded
- Session detail page → **Show QR code** → download PNG for printing
- Questions can be reordered, edited, marked sensitive, or set as **Info text**
  (info items display text to the camper with no recording prompt)

### 5. Camper flow

- Scan QR code or visit `/join?session=<id>`
- Enter a name, choose **On my own**
- Record answers — each question has a **Skip** option
- Done!

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Local default | Production |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Supabase session-pooler connection string |
| `JWT_SECRET` | *(insecure default)* | Long random string — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `PORT` | `3001` | Set by Render automatically |
| `FRONTEND_URL` | `http://localhost:5173` | `https://camp-feedback.vercel.app` |
| `APP_URL` | `http://localhost:3001` | `https://camp-feedback.onrender.com` |
| `SUPABASE_URL` | *(blank = local disk)* | `https://<ref>.supabase.co` (Project URL, no trailing slash) |
| `SUPABASE_SERVICE_KEY` | *(blank)* | `service_role` key from Supabase Settings → API |
| `SUPABASE_BUCKET` | `recordings` | Name of private Storage bucket |
| `OPENAI_API_KEY` | *(blank = worker disabled)* | Enables transcription worker |
| `ANTHROPIC_API_KEY` | *(blank = no redaction)* | Enables Claude PII redaction pass |

### Frontend (`frontend/.env.local`)

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend URL in production (e.g. `https://camp-feedback.onrender.com`). Omit in local dev — Vite proxy handles it. |

---

## Project structure

```
Miles of Music Feedback/
├── backend/                    # Fastify + Prisma + TypeScript
│   ├── prisma/schema.prisma    # Postgres schema
│   ├── src/
│   │   ├── index.ts            # Server entry + worker startup
│   │   ├── config.ts           # Env var validation (zod)
│   │   ├── db.ts               # Prisma client singleton
│   │   ├── storage.ts          # Supabase Storage (falls back to local disk)
│   │   ├── transcription.ts    # TranscriptionProvider interface + OpenAI impl + Claude redaction
│   │   ├── worker.ts           # Background polling worker (transcription queue)
│   │   └── routes/
│   │       ├── admin/          # setup, auth, sessions+recordings (JWT-protected)
│   │       └── public/         # sessions, respondents, recordings (no auth)
│   └── render.yaml             # Render deployment config
└── frontend/                   # React + Vite + Tailwind
    ├── vercel.json              # Vercel deployment config
    └── src/
        ├── pages/
        │   ├── Join.tsx         # Camper landing + name entry
        │   ├── Interview.tsx    # Question/recorder flow (supports info type + skip)
        │   ├── Done.tsx
        │   └── admin/
        │       ├── Sessions.tsx     # Session list + create
        │       ├── SessionDetail.tsx # Questions editor, QR, respondent list + delete
        │       ├── Responses.tsx    # Recordings with audio playback + transcripts
        │       ├── Login.tsx
        │       └── Setup.tsx
        ├── components/
        │   ├── Recorder.tsx     # MediaRecorder UI (IndexedDB buffer, upload, retry)
        │   └── AudioPlayer.tsx
        └── lib/
            ├── api.ts           # All fetch calls
            └── idb.ts           # IndexedDB (pending recordings + session state)
```

---

## Milestone roadmap

| # | Scope | Status |
|---|---|---|
| 1 | Walking skeleton — solo camper flow, audio upload, basic admin | ✅ Done |
| 1+ | GitHub + Render + Vercel + Supabase deployment | ✅ Done |
| 1+ | Background transcription worker (OpenAI gpt-4o-transcribe + Claude redaction) | ✅ Done |
| 1+ | Info question type (text display, no recording) + skip button | ✅ Done |
| 1+ | Delete respondent (audio files + DB records) | ✅ Done |
| 2 | Partner flow — two-camper interview with role-swap, partial completion | — |
| 3 | Offline support — service worker, IndexedDB background sync, upload progress | — |
| 4 | Admin transcript view improvements, manual transcript editing | — |
| 5 | Per-question + cross-question synthesis via Claude, ZIP export | — |
| 6 | Polish — error handling, WCAG audit, data retention job, visual design pass | — |

---

## Render keep-alive

The Render free tier hibernates after 15 minutes of inactivity. Point an
[UptimeRobot](https://uptimerobot.com) monitor at
`https://camp-feedback.onrender.com/health` on a 5-minute interval to keep
it awake during active use.

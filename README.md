# Miles of Music Camp — Feedback App

## Milestone 1: Walking skeleton

Camper solo flow · backend upload · admin dashboard with audio playback.

---

## Quick start

### 1. Backend

```bash
cd backend
cp .env.example .env          # edit JWT_SECRET at minimum
npm install
npm run db:push               # creates dev.db
npm run dev                   # http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

### 3. First-time admin setup

Visit **http://localhost:5173/admin/setup** and create the admin account.

### 4. Create a session

- Log in at `/admin/login`
- Click **New session**, name it (e.g. "Miles of Music 2026")
- The default 13-question set is pre-loaded
- Click the session → **Show QR code** → download the PNG for printing

### 5. Camper flow

- Scan the QR code (or visit `/join?session=<id>`)
- Enter a name, choose **On my own**
- Record answers to each question
- Done!

---

## Environment variables (backend/.env)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite path |
| `JWT_SECRET` | *(insecure default)* | **Change this in production** |
| `PORT` | `3001` | Backend port |
| `UPLOAD_DIR` | `./uploads` | Audio file storage |
| `FRONTEND_URL` | `http://localhost:5173` | CORS allow-list |
| `APP_URL` | `http://localhost:3001` | Used in QR code URLs |

---

## Project structure

```
Miles of Music Feedback/
├── backend/                  # Fastify + Prisma + SQLite
│   ├── prisma/schema.prisma
│   ├── src/
│   │   ├── index.ts          # Server entry
│   │   ├── config.ts
│   │   ├── db.ts             # Prisma client
│   │   ├── storage.ts        # Local disk storage (swap for R2 here)
│   │   └── routes/
│   │       ├── admin/        # setup, auth, sessions
│   │       └── public/       # sessions, respondents, recordings
│   └── uploads/              # Audio files (gitignored)
└── frontend/                 # React + Vite + Tailwind
    └── src/
        ├── pages/
        │   ├── Join.tsx       # Camper landing
        │   ├── Interview.tsx  # Question + recorder flow
        │   ├── Done.tsx
        │   └── admin/         # Dashboard, session detail, responses
        ├── components/
        │   ├── Recorder.tsx   # MediaRecorder UI
        │   └── AudioPlayer.tsx
        └── lib/
            ├── api.ts         # All fetch calls
            └── idb.ts         # IndexedDB (recording buffer + session state)
```

---

## Milestone roadmap

| # | Scope | Status |
|---|---|---|
| 1 | Walking skeleton — solo flow, upload, admin | ✅ Done |
| 2 | Partner flow, role swap, partial completion | — |
| 3 | Service worker, IndexedDB background sync, offline | — |
| 4 | Transcription (gpt-4o-transcribe) + Claude redaction | — |
| 5 | Per-question + cross-question synthesis, ZIP export | — |
| 6 | Prompt audio upload, SMS reminders, WCAG audit | — |

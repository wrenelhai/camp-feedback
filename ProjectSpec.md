Camp Feedback App — Product Specification
Overview
A mobile web app that enables pairs of campers to interview each other about their camp experience by recording audio responses to guided prompts. Audio is captured in the browser, buffered locally for offline resilience, uploaded when connectivity is available, transcribed server-side, and synthesized into thematic summaries per question.
Scale: ~130 campers, ~65 interview pairs, one-time event (with reusability for future camps).
Primary constraints: Spotty 4G connectivity at camp; no app installs; minimal friction for teenage users; lightweight operational burden for organizers.

User personas
Camper (primary user): Pairs of campers take turns interviewing each other through a series of prompts. Records audio responses directly in the browser. May lose connectivity mid-interview. Should have an option to self-interview if no other camper is available.
Camp organizer (admin): Sets up the session before camp, designs the question prompts, prints QR codes, reviews transcripts and synthesized themes. Non-technical — needs a simple dashboard, not a developer UI.

User flow
Camper flow
Camper scans a printed QR code (one QR per camp, or per cabin/group).
QR opens https://{app-domain}/join?session={sessionId} in their mobile browser.
Landing page explains the exercise in 2–3 sentences, asks for a display name or nickname (no account, no email).
App asks if they have a partner to interview. Two options:
Self-interview flow: App gives the camper prompts to respond to on their own.
Partner interview flow: App gives the camper prompts to ask of a second camper. At the conclusion of the interview, the app prompts them to switch roles and repeat the interview process. 
App displays the first prompt. The first camper reads it aloud to the second camper.
The second camper taps Record Answer, speaks their response, then taps Stop.
The app shows a playback option and buttons to Confirm or Re-record the answer. Camper confirms or re-records.
App advances to the next prompt. Repeat through all prompts (~6–10 questions total).
After the second camper has answered all prompts, roles swap: the second camper becomes interviewer, the first camper becomes the interviewee, same prompt set.
When both campers have completed all prompts, app shows a "Thanks, you're done" screen.
Offline behavior
All prompts and app assets are cached via service worker on first load.
Audio recordings are stored in IndexedDB immediately after recording.
A background sync process attempts upload whenever connectivity is detected.
Campers are given an option to save their data locally and get a reminder text to return and upload later on if connectivity remains unavailable throughout the interview. 
If a camper closes the browser mid-session, reopening the same URL resumes where they left off (session state in localStorage + IndexedDB).
Admin flow
Organizer logs into admin dashboard with email + password (single-admin or small team).
Creates a new session: name, date, list of questions.
Generates QR code(s) for the session. Downloads as PNG for printing.
During/after camp, dashboard shows:
Number of interviews started, number completed
Number of recordings uploaded, number pending or failed to upload
Per-question list of responses (transcripts only)
After most responses are in, organizer clicks Synthesize Responses on a question (or all questions) to generate thematic summaries.
Organizer can export everything as a ZIP (full responses by question and synthesis reports in Markdown or PDF).

Functional requirements
Camper-facing app (PWA)
Single-page React app (or equivalent lightweight framework)
Installable as PWA, but works fine as a regular mobile web page — no install required
Service worker for offline asset caching
IndexedDB for persisting recordings before upload
MediaRecorder API for audio capture (WebM/Opus format preferred for size; fall back to whatever the browser supports)
Target audio quality: mono, 16–24 kHz, sufficient for speech transcription
Max recording length per answer: 3 minutes (soft cap with visible timer)
Session state persists across browser reloads
Minimal visual design — large tap targets, clear typography, no jargon
Microphone permission requested at first recording, with a one-line explanation of why
No login required for campers
Backend service
REST API with endpoints for:
POST /sessions (admin) — create a feedback session with questions
GET /sessions/:id (public) — fetch session config and question list for campers
POST /recordings — upload an audio file with metadata (pair ID, question ID, speaker role)
GET /admin/sessions/:id/responses (admin, authenticated) — fetch all responses for review
POST /admin/sessions/:id/synthesize (admin, authenticated) — trigger synthesis job
GET /admin/sessions/:id/export (admin, authenticated) — download ZIP export
Auth: simple email/password for admin (bcrypt-hashed), JWT for session tokens. No auth for camper endpoints.
File storage: S3-compatible object storage (recommend Cloudflare R2 for cost and no egress fees). Audio files stored at {sessionId}/{pairId}/{questionId}-{speakerRole}-{timestamp}.webm.
Database: Postgres (or SQLite for simplicity if deploying to a single instance). Schema below.
Data model
sessions
  id (uuid, pk)
  name (text)
  created_at (timestamp)
  created_by (admin user id)
  questions (jsonb array of {id, order, prompt_text, prompt_audio_url?})
  status (draft | active | closed)

respondents
  id (uuid, pk)
  session_id (fk)
  camper_a_name (text, nullable)
  camper_b_name (text, nullable)
  created_at (timestamp)
  completed_at (timestamp, nullable)

recordings
  id (uuid, pk)
  question_id (text, matches questions[].id in session)
  speaker_role (A | B)
  is_followup (boolean, default false)
  audio_storage_key (text)
  duration_seconds (int)
  uploaded_at (timestamp)
  transcribed_at (timestamp, nullable)
  transcript (text, nullable)
  transcript_redacted (text, nullable)

syntheses
  id (uuid, pk)
  session_id (fk)
  question_id (text)
  generated_at (timestamp)
  themes (jsonb)  -- array of {theme_name, description, estimated_count, quotes[]}
  raw_output (text)
  prompt_version (text)  -- for reproducibility

admin_users
  id (uuid, pk)
  email (text, unique)
  password_hash (text)
  created_at (timestamp)
Transcription pipeline
Upon successful upload, enqueue a transcription job (background worker — simple BullMQ queue with Redis, or a cron-based worker polling unprocessed recordings if avoiding Redis).
Transcription provider: Default to OpenAI gpt-4o-transcribe ($0.006/min, good quality, simple API). Abstract this behind a TranscriptionProvider interface so we can swap in self-hosted faster-whisper or others later.
After transcription, run a de-identification pass via Claude API:
Prompt Claude to redact last names (unless mentioned as instructors or staff), phone numbers, and any other PII
Store both the raw and redacted transcripts
Only redacted transcripts are used for synthesis
Handle failures gracefully: if transcription fails, mark the recording and surface it in admin dashboard for manual retry.
Synthesis pipeline
Triggered manually by admin from dashboard (per-question or all-at-once).
For each question, gather all redacted transcripts across all pairs for that question.
Send to Claude via API with a prompt like:
 You are analyzing feedback from a music camp. Here are {N} responses from campers
  to the question: "{question_text}"

  Responses:
  {numbered list of transcripts}

  Please:
  1. Identify 5–8 common themes across these responses
  2. For each theme, estimate how many responses touch on it
  3. Pull 2–3 representative direct quotes for each theme (verbatim from responses)
  4. Note any surprising outliers or minority perspectives
  5. Flag any responses that seem to indicate distress or require follow-up

  Output as structured JSON matching this schema: {schema}
Store the structured output in the syntheses table.
Render in the dashboard as a readable report with collapsible themes and clickable quotes that jump to the source response.
Admin dashboard
Minimal but clean. Can be a separate route tree in the same app or a distinct dashboard app.
Pages:
Sessions list — cards showing each session with status and counts
Session detail — question list, pair count, completion stats, QR code download
Responses review — table of all recordings for a session with audio playback, transcript, redacted transcript (toggle), and a "flag for review" button
Synthesis view — per-question thematic summaries with quote attribution
Export — ZIP download containing audio files (organized by question and pair), transcripts as text files, and synthesis as Markdown
Support for editing/correcting transcripts manually if auto-transcription has errors.

Non-functional requirements
Performance
Recording UI must be responsive on iPhone SE–era hardware and budget Android phones
Upload chunk size: 1 MB chunks with retry on failure
Service worker must cache the entire app shell including prompts for offline use
Backend can handle 200 concurrent campers with modest resources (single small VPS is fine)
Privacy and data handling
No real names required; nicknames or first-name-only encouraged
Raw audio stored in private object storage with signed URLs for admin access only
Redacted transcripts are the default for synthesis; raw transcripts accessible only to admin
Recordings and transcripts auto-deleted 90 days after session close (configurable)
Clear data-handling notice on the landing page, written in non-jargony language
If any recording is flagged by the synthesis pipeline as potentially indicating distress, admin is notified via email
Accessibility
All interactive elements keyboard-accessible
Sufficient color contrast (WCAG AA minimum)
Clear labels and instructions at every step
Text-based prompts available alongside any audio prompts
Reliability
Uploads must survive network drops — retry with exponential backoff
Recordings never lost due to browser close or crash — persist to IndexedDB before any network operation
Server returns specific error codes the client can handle gracefully (auth issues, file too large, malformed request)

Tech stack recommendations
Layer
Recommendation
Why
Frontend
React + Vite, TypeScript
Standard, well-supported, fast to iterate
PWA tooling
Workbox (via Vite PWA plugin)
Handles service worker, caching, background sync
Audio
Native MediaRecorder API
No external dependencies, good browser support
Local storage
IndexedDB via idb library
Reliable persistence for audio blobs
Backend
Node.js + Fastify (or Hono)
Lightweight, fast, good TypeScript support
Database
Postgres via Prisma
Good developer experience, migrations handled
Job queue
BullMQ + Redis, OR cron-based polling worker
Choose based on whether Redis is acceptable infra
Object storage
Cloudflare R2
S3-compatible, no egress fees, cheap
Transcription
OpenAI gpt-4o-transcribe
Cheapest reliable option; abstracted for later swap
Synthesis
Claude API (claude-opus-4-7)
Best model for nuanced qualitative synthesis
Hosting
Fly.io or Render for backend; Cloudflare Pages for frontend
Simple deployment, free/cheap tiers cover this scale
QR generation
qrcode npm package
Generate PNG/SVG server-side


Question design (starter set — organizer should customize)
What was your role at camp? (Returning camper, new camper, returning instructor, new instructor, returning croo, new crop) 
Thinking about the overall vibe of camp (sense of community, belonging, inclusivity, joy, fun, creative collaboration, etc.), what worked well? What did you like?
Again, thinking about the overall camp vibe, What could be improved? What didn't you like?
Now, think about camp programming -- classes, workshops, lunch & dinner concerts, nightly events: What worked well? What did you like?
Thinking about camp programming: What could be improved? What didn't you like?
Thinking about the community agreements we formed at the beginning of camp, please share any examples of how we met or did not live up to those agreements this week. Were there any particular interactions that were helpful in fostering the positive vibe, or that were problematic?
Can you think of a new agreement or a change to an existing one you would make?
Now, think about the logistics of camp -- the registration process, transportation coordination, food and lodging, etc.: What worked well? What did you like?
Still thinking about camp logistics: What could be improved? What didn't you like?
Think about the communication you received before and during camp -- emails, announcement boards, in-person announcements: What worked well? What did you like?
Still thinking about camp communication: What did not work well and could be improved? What didn't you like?
We’re collecting stories about the impact of Miles of Music. If you’d like to share, we’d love a short testimonial about what makes Miles of Music Camp special to you. Feel free to include how you’d like your name to appear, or leave it anonymous.
Anything else you’d like to add?

Milestones and deliverables for the build
Milestone 1: Walking skeleton (MVP)
Camper flow: join session via URL, single-person recording, submit responses to 3 test questions
Backend: accepts uploads, stores in R2, records metadata in Postgres
Admin: basic login, see list of recordings with audio playback
Milestone 2: Pair flow
Two-camper interview flow with role-swapping
Session state persistence across reloads
Milestone 3: Offline support
Service worker + IndexedDB buffering
Background sync on reconnect
Upload progress indicators
Milestone 4: Transcription and redaction
Background worker processes uploads through Whisper
Claude-based redaction pass
Admin dashboard shows transcripts alongside audio
Milestone 5: Synthesis and export
Per-question theme extraction via Claude
Admin synthesis view
ZIP export with audio, transcripts, and reports
Milestone 6: Polish
Error handling, edge cases (browser quirks, permission denial, etc.)
Visual design pass
Admin UX improvements
Data retention job (auto-delete after N days)

Open questions for the builder
Should the prompt itself be available as pre-recorded audio for accessibility or for campers who struggle with reading? Yes if not too difficult to build.
What should happen if one camper in a pair finishes but the other abandons partway through? Allow the completed responses to stand on their own, including the partially complete survey.
Do organizers want any real-time dashboard during camp, or is post-camp review sufficient? Post-camp review is ok.
Is multi-admin access needed, or is a single shared login sufficient for this camp? Shared logon is ok for now.
Should synthesis include cross-question analysis (e.g., "campers who loved X also mentioned Y")? Yes - highlight any interesting connections across questions.

Success criteria
At least 80% of campers complete the full interview flow
At least 95% of recordings successfully upload and transcribe
Organizer can produce a readable synthesis report within 1 hour of the last interview being completed
Organizer reports that the synthesized themes accurately reflect what they observed at camp
Zero recordings lost due to connectivity issues during camp

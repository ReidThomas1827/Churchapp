# Sermon Notes

A personal iOS **web app (PWA)** for recording, transcribing, and studying sermons.
No Mac, no App Store, no build step — plain HTML + JS + CSS, hosted free on Cloudflare Pages.

## Features

- **Installable PWA** — manifest, service worker, icons, offline app shell.
- **Record** — microphone capture with the screen kept awake (Wake Lock), a live timer
  and level meter, the title/date popup, an "I'm not attending this week" button, and a
  warning if the app gets backgrounded mid-recording.
- **Transcribe** — audio goes to Deepgram Nova; the transcript is saved to the sermon.
- **AI study notes** — Gemini turns the transcript into summary, scriptures, sections, takeaways.
- **Daily quizzes** — auto-generated multiple-choice quizzes on the latest sermon and on a
  scheduled study passage, with score history. Surfaced on the home tab and via notifications.
- **Study plan** — `date + scripture reference` rows, each quizzable.
- **Global search** — ask across your whole history (pgvector retrieval when Supabase is set
  up, otherwise on-device transcripts).
- **Export** — PDF and Word (`.docx`), generated in the browser.
- **Cloud sync & backup** — text data (transcripts, notes, study plan, quiz scores) syncs to
  Supabase. Audio stays on the device only.
- **Notifications** — two daily Web Push reminders (sermon + study), Mon–Sat, at a random
  time 9am–9pm, paused automatically on "not attending" weeks.

The app is **local-first**: recording, playback, notes display, study plan, quizzes, and
export all work offline on the device. Cloud features light up as you add keys — and any
cloud failure never breaks the local app.

## Run locally (UI / recording / storage)

No Node required:

```sh
cd C:/Users/reidc/OneDrive/sermonapp
py -m http.server 8000
```

Open <http://localhost:8000>. `localhost` is a secure origin, so the mic, Wake Lock, and
service worker work. The `/api/*` features need the Cloudflare deploy — locally they show a
"configure in Settings" hint, which is expected. Regenerate icons with `py icons/generate_icons.py`.

## Deploy free on Cloudflare Pages

The no-Node path: put this folder in a GitHub repo (drag-and-drop upload via github.com is
fine), then in the Cloudflare dashboard → **Pages** → **Create** → connect the repo.

- **Build command:** *(leave empty)*
- **Build output directory:** `/`

Functions in `/functions` deploy automatically. After the first deploy, add the environment
variables below (**Settings → Environment variables**), then redeploy.

### Environment variables (Cloudflare Pages → Settings → Environment variables)

| Variable | Needed for | Where to get it |
|---|---|---|
| `DEEPGRAM_API_KEY` | Transcription | <https://deepgram.com> ($200 free credit) |
| `GEMINI_API_KEY` | Notes, quizzes, search, embeddings | <https://aistudio.google.com/apikey> |
| `GEMINI_MODEL` | optional (default `gemini-2.0-flash`) | — |
| `GEMINI_EMBED_MODEL` | optional (default `text-embedding-004`) | — |
| `SUPABASE_URL` | Sync, search index, push storage | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE` | **secret**, server-only | Supabase → Project Settings → API → service_role |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Push notifications | open `/tools/vapid.html` once and copy |
| `VAPID_SUBJECT` | Push (a `mailto:` URL) | your email |
| `CRON_SECRET` | Protects `/api/cron` | make up a long random string |
| `QUIZ_TZ` | Quiz time window | your IANA timezone, e.g. `America/New_York` |
| `NOTION_API_KEY` | Export to Notion | <https://notion.so/my-integrations> → New integration → Internal Integration Secret |

The minimum to record + transcribe + get notes is just `DEEPGRAM_API_KEY` + `GEMINI_API_KEY`.
Everything else is additive.

### Supabase (sync + search + notifications)

Sync is fully automatic — no key ever goes on the phone. Just:
1. Create a free project at <https://supabase.com>.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Copy the **Project URL** and the **service_role** key into the Cloudflare env vars
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`) → redeploy.

Every device then pushes on save and pulls on launch automatically.

### Notion export

1. Create an internal integration at <https://notion.so/my-integrations> → copy its secret into
   `NOTION_API_KEY` → redeploy.
2. In Notion, open each page or database you want available as an export destination → **"..."
   menu → Connections → add your integration**. This step is required per page/database — Notion
   only shows the integration what's explicitly shared with it (there's no workspace-wide toggle
   for internal integrations).
3. On a sermon's detail screen, tap **Export to Notion** — the app lists everything you've shared
   and lets you pick (a database becomes a row per sermon, a page becomes a sub-page). No ID to
   find or copy; your last choice is remembered as the default.

### Notifications (after Supabase is set up)

1. Open `https://your-site.pages.dev/tools/vapid.html`, click generate, and put the two keys
   into `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (+ set `VAPID_SUBJECT`, `CRON_SECRET`, `QUIZ_TZ`). Redeploy.
2. Set up a free recurring trigger at <https://cron-job.org> calling
   `https://your-site.pages.dev/api/cron?key=YOUR_CRON_SECRET` every ~15 minutes, Mon–Sat.
   (Cloudflare Pages can't run cron itself, so an external trigger does the timing; the function
   picks one random time per day inside the 9am–9pm window and fires once it passes.)
3. On your iPhone: **Add to Home Screen**, open from the icon, then **Settings → Enable notifications**.

## Add to your iPhone

In **Safari**, open the deployed URL → **Share** → **Add to Home Screen**. Launch from the
icon for full-screen mode and notifications.

## Test checklist (after deploy)

- [ ] Settings shows Deepgram + Gemini "configured"
- [ ] Record a short clip → Save → it appears in Archive
- [ ] Transcribe → transcript appears → Generate notes → notes appear
- [ ] Quiz "me on this" returns questions; score saves
- [ ] Export PDF and Word both download
- [ ] (Supabase) Settings shows Supabase "configured"; "Sync now" works; data appears on a 2nd device
- [ ] (Search) After a sermon is noted, a search query returns a cited answer
- [ ] (Push) Settings shows Web Push "configured"; Enable notifications succeeds; a manual hit of
      `/api/cron?key=…` (within 9am–9pm) delivers a notification that opens the quiz

## Project layout

```
index.html, styles.css, manifest.webmanifest, sw.js   app shell + service worker
icons/                  generated icons (+ generate_icons.py)
tools/vapid.html        one-time VAPID key generator
js/
  app.js                bootstrap, tab nav, quiz deep-links, sync-on-load
  config.js             runtime config (Supabase URL/anon key in localStorage)
  db.js / store.js      IndexedDB + domain operations (with sync hooks)
  sync.js / supabase.js offline-first sync to Supabase (text only)
  recorder.js           MediaRecorder + Wake Lock + level meter
  push.js               Web Push subscription flow
  api.js                calls to /api/*
  export.js             PDF + DOCX
  ui.js                 DOM/modal/toast helpers
  views/                record, daily, archive, study, search, quiz, settings
functions/api/
  _lib.js _webpush.js   shared helpers (Gemini, Supabase, Web Push crypto)
  health, transcribe, notes, quiz, search, embed, subscribe, cron
supabase/schema.sql     database schema
```

## Notes & limitations (by design)

- Recording is **foreground-only** — locking the phone or switching apps stops capture.
- iOS web-push needs the app **added to the Home Screen**, and can need a reopen to
  re-subscribe after a device restart.
- A phone mic across a large room is hard audio; a ~$20–50 clip-on mic near the front
  improves accuracy a lot.
- Personal/single-user setup: Supabase RLS is left off and the anon key is entered in Settings
  (not committed). Keep your URL and keys private. To lock down further, add Supabase Auth + RLS.

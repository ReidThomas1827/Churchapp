# Pocket AI sermon import — design

## Problem

Recording a sermon through the app today requires the phone screen to stay
on for the full length of the sermon (recording) plus transcription time —
often close to an hour of active screen time. The user has a Pocket AI
device (heypocket.com) that can record and transcribe independently of the
phone. The goal is to get that transcript into the sermon app with as
little phone interaction as possible, while keeping a manual confirmation
step so non-sermon recordings (meetings, personal notes) never pollute the
sermon archive, and without ever storing Pocket's audio on this app's
infrastructure.

## What Pocket provides

Pocket (docs.heypocketai.com) has a public API and a webhook system:
- Webhooks fire `transcription.completed` and `summary.completed` (among
  other events) when a recording finishes processing.
- Payloads include recording metadata and the full transcript with speaker
  attribution and timestamps.
- Delivery is at-least-once, HMAC-SHA256 signed (`X-HeyPocket-Signature`
  header, computed over `{timestamp}.{rawBody}`), with retries.
- A signing secret is issued once when the webhook is created in the
  Pocket app.

## Approach

Only `summary.completed` is acted on (it's the fully-processed event). The
webhook handler creates a normal row directly in the existing `sermons`
table, flagged as pending review, and reuses the app's existing
note-generation, embedding, and sermon-editing code paths rather than
building a parallel pipeline or a separate inbox screen.

### Data flow

1. User registers a webhook in the Pocket app pointing at
   `https://churchapp-b4m.pages.dev/api/pocket-webhook`, and stores the
   signing secret in Cloudflare as `POCKET_WEBHOOK_SECRET`.
2. Pocket finishes processing a recording → POSTs `summary.completed` with
   the transcript + recording ID + timestamp.
3. `functions/api/pocket-webhook.js`:
   - Verifies the HMAC signature; rejects (401) on mismatch.
   - Ignores any event type other than `summary.completed`.
   - Derives a deterministic sermon id: `pocket_<pocketRecordingId>`. This
     makes retried/duplicate deliveries naturally idempotent via Supabase
     upsert — no separate dedup table needed.
   - Looks up any existing sermon row with that id first:
     - If it exists and `pending = false` (user already reviewed and
       confirmed it) → no-op. This protects user edits from being
       clobbered by a retried delivery or a later "summary regeneration"
       event.
     - Otherwise (new or still pending) → proceeds.
   - Generates notes via the same Gemini prompt `functions/api/notes.js`
     already uses, refactored into a shared helper in `_lib.js` so both
     call one source of truth.
   - Embeds the sermon for search the same way `functions/api/embed.js`
     does today.
   - Upserts the full sermon row: title defaults to `"Sermon — <date>"`,
     speaker blank, `kind: "Sermon"`, `attended: true`, `pending: true`,
     `source: "pocket"`, transcript, notes, date derived from the Pocket
     recording's timestamp.
   - On a genuinely new insert (not a no-op), sends a push notification
     ("New sermon ready to review") via the existing `_webpush.js`
     pipeline.
4. In `js/views/archive.js`, sermons with `pending: true` render in a
   distinct section at the top of Archive with a badge. Tapping one opens
   the existing `editSermonModal` (title/speaker/date editing — no new UI
   needed). Two actions:
   - **Confirm** — clears `pending`; the row becomes a normal sermon,
     quizzable like any other.
   - **Dismiss** — deletes the row (it wasn't actually a sermon).

### Error handling

If Gemini note generation or embedding fails partway through, the handler
still saves the sermon with the transcript present and `status:
"transcribed"` (no notes) rather than dropping the recording. Notes can
then be generated from the app the same way a manually-recorded sermon's
failed note generation is retried today.

### Schema change

```sql
alter table sermons add column if not exists pending boolean default false;
alter table sermons add column if not exists source text default 'app';
```

### What's explicitly out of scope

- No audio is ever fetched from Pocket's API or stored anywhere in this
  app — only the transcript text.
- No AI-guessed title/speaker inference — the default title is a plain
  date-based placeholder; the user fills in the rest during the existing
  edit flow. Keeps the webhook handler simple and avoids hallucinated
  attribution.
- No tagging/folder-based filtering on the Pocket side — every completed
  recording creates a pending row; filtering out non-sermon recordings is
  handled entirely by the user's manual Confirm/Dismiss step.
- No dedicated "inbox" screen — pending items live directly in the
  existing Archive view.

## Testing

No test framework exists in this vanilla-JS app. Verification is manual:
a fabricated webhook payload is sent via curl once the handler is built,
confirming the row lands correctly in Supabase and the
badge/Confirm/Dismiss flow works in the Archive UI. The real webhook is
then registered in the Pocket app for live use.

## User-facing flow

1. Press record on the Pocket device during the sermon; phone stays
   untouched.
2. Stop the recording when the sermon ends.
3. Pocket processes it in the background (a few minutes).
4. A push notification arrives: "New sermon ready to review."
5. Open the app whenever convenient — a "New from Pocket" item is at the
   top of Archive.
6. Tap it, adjust title/speaker in the familiar edit screen, tap Confirm
   (or Dismiss if it wasn't a sermon).

Net effect: screen-on time drops from ~an hour of active recording to a
few seconds of review, whenever the user next checks their phone.

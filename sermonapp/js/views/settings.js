import { el, modal, toast } from "../ui.js";
import { CONFIG, saveConfig, apiUrl } from "../config.js";
import { enablePush } from "../push.js";
import { syncNow, syncEnabled } from "../sync.js";
import { getMicPermission, requestMicPermission } from "../recorder.js";
import { listSermons, listStudy, listQuizHistory } from "../store.js";
import { migrateToCloud } from "../api.js";

function statusLine(label, ok) {
  return el("div", { class: "spread" }, [
    el("span", { class: "small", text: label }),
    el("span", { class: "tag " + (ok ? "good" : "warn"), text: ok ? "configured" : "not set" }),
  ]);
}

export function openSettings() {
  const supaUrl = el("input", { type: "url", placeholder: "https://xxxx.supabase.co", value: CONFIG.supabaseUrl || "" });
  const supaKey = el("input", { type: "text", placeholder: "anon public key", value: CONFIG.supabaseAnonKey || "" });

  const status = el("div", { class: "stack" }, el("div", { class: "small muted", text: "Checking backend…" }));
  fetch(apiUrl("/api/health"))
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((h) => {
      status.replaceChildren(
        statusLine("Deepgram — transcription", h.deepgram),
        statusLine("Gemini — notes, quizzes, search", h.gemini),
        statusLine("Supabase — sync & search index", h.supabase),
        statusLine("Web Push — daily notifications", h.push),
        el("div", { class: "small muted", text: "Model: " + (h.model || "default") })
      );
    })
    .catch(() => {
      status.replaceChildren(el("div", { class: "small muted", text: "Backend not reachable. You're running locally or the Cloudflare Functions aren't deployed yet — recording and saving still work; transcription and AI need the deploy + API keys." }));
    });

  const syncBtn = el("button", { class: "btn", onClick: async () => {
    if (!syncEnabled()) return toast("Add your Supabase URL + key first.", "error");
    toast("Syncing…");
    await syncNow();
    toast("Synced.", "success");
  } }, "Sync now");

  const migrateBtn = el("button", { class: "btn primary" }, "Migrate this device's data to cloud");
  migrateBtn.addEventListener("click", async () => {
    const orig = migrateBtn.textContent;
    migrateBtn.disabled = true; migrateBtn.textContent = "Migrating…";
    try {
      const [sermons, study, quizzes] = await Promise.all([listSermons(), listStudy(), listQuizHistory()]);
      if (!sermons.length && !study.length && !quizzes.length) {
        toast("Nothing on this device to migrate.");
      } else {
        const r = await migrateToCloud({ sermons, study, quizzes });
        toast(`Migrated ${r.sermons} sermon(s) and ${r.study} study entr${r.study === 1 ? "y" : "ies"} to the cloud.`, "success");
      }
    } catch (e) {
      toast(e.status === 501 ? "Supabase isn't set up on the server yet." : (e.message || "Migration failed."), "error");
    }
    migrateBtn.disabled = false; migrateBtn.textContent = orig;
  });

  const pushBtn = el("button", { class: "btn", onClick: () => enablePush() }, "Enable notifications");

  // Microphone access
  const micStatus = el("span", { class: "tag", text: "checking…" });
  const micBtn = el("button", { class: "btn" }, "Allow microphone access");
  const micHelp = el("p", { class: "small muted", hidden: true });
  const setMic = (state) => {
    if (state === "granted") {
      micStatus.className = "tag good"; micStatus.textContent = "Allowed";
      micBtn.hidden = true; micHelp.hidden = true;
    } else if (state === "denied") {
      micStatus.className = "tag warn"; micStatus.textContent = "Blocked";
      micBtn.hidden = false; micBtn.textContent = "Try again";
      micHelp.hidden = false;
      micHelp.textContent = "Microphone is blocked. On iPhone: Settings → Apps → Safari → Microphone (or this app’s entry) → Allow, then reopen the app.";
    } else {
      micStatus.className = "tag"; micStatus.textContent = "Tap to allow";
      micBtn.hidden = false; micBtn.textContent = "Allow microphone access"; micHelp.hidden = true;
    }
  };
  micBtn.addEventListener("click", async () => {
    const r = await requestMicPermission();
    if (r.ok) { toast("Microphone allowed.", "success"); setMic("granted"); }
    else if (r.error === "NotAllowedError") { toast("Microphone was blocked.", "error"); setMic("denied"); }
    else { toast("Couldn't access the microphone.", "error"); }
  });
  getMicPermission().then(setMic);
  const micCard = el("div", { class: "card stack" }, [
    el("div", { class: "spread" }, [el("h3", { text: "Microphone", style: "font-size:15px" }), micStatus]),
    el("p", { class: "small muted", text: "Recording needs microphone access. Grant it here so it’s ready before your first recording." }),
    micBtn, micHelp,
  ]);

  const body = el("div", { class: "stack" }, [
    micCard,
    el("div", { class: "card stack" }, [el("h3", { text: "Backend status", style: "font-size:15px" }), status]),
    el("div", { class: "card stack" }, [
      el("h3", { text: "Cloud sync (optional)", style: "font-size:15px" }),
      el("p", { class: "small muted", text: "Paste your Supabase URL and anon key to back up and sync across devices. Safe to leave blank — everything is stored on this device by default." }),
      el("div", {}, [el("label", { class: "field", text: "Supabase URL" }), supaUrl]),
      el("div", {}, [el("label", { class: "field", text: "Supabase anon key" }), supaKey]),
      syncBtn,
      el("hr", { class: "sep" }),
      el("p", { class: "small muted", text: "One-time: push everything already saved on this device (transcripts, notes, study plan, quiz scores) up to the cloud. Audio stays on the device." }),
      migrateBtn,
    ]),
    el("div", { class: "card stack" }, [
      el("h3", { text: "Notifications", style: "font-size:15px" }),
      el("p", { class: "small muted", text: "Two daily quiz reminders (sermon + study), Mon–Sat. Works only after you’ve added the app to your Home Screen and opened it from the icon." }),
      pushBtn,
    ]),
    el("div", { class: "card stack" }, [
      el("h3", { text: "Add to Home Screen", style: "font-size:15px" }),
      el("p", { class: "small muted", text: "In Safari: tap Share → Add to Home Screen, then open it from the icon for full-screen mode and notifications." }),
    ]),
  ]);

  modal({
    title: "Settings",
    body,
    actions: [
      { label: "Close", class: "ghost", value: false },
      {
        label: "Save", class: "primary",
        value: () => {
          saveConfig({ supabaseUrl: supaUrl.value.trim(), supabaseAnonKey: supaKey.value.trim() });
          toast("Saved.", "success");
          if (syncEnabled()) { toast("Syncing…"); syncNow().then(() => toast("Synced.", "success")).catch(() => {}); }
          return true;
        },
      },
    ],
  });
}

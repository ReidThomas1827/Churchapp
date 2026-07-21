import { el, clear, toast, confirmDialog, modal, fmtDate, fmtDuration, chevron, spinnerRow } from "../ui.js";
import {
  listSermons, getSermon, getAudio, saveSermon, deleteSermon, dropAudio, setQuizPin,
  listFolders, getFolder, createFolder, saveFolder, deleteFolder, moveSermon,
} from "../store.js";
import { transcribe, generateNotes, embedSermon, exportNotion } from "../api.js";
import { exportPDF, exportDOCX } from "../export.js";
import { openQuiz } from "./quiz.js";

const STATUS = {
  recorded: { label: "Recorded", cls: "accent" },
  transcribing: { label: "Transcribing…", cls: "warn" },
  transcribed: { label: "Transcribed", cls: "good" },
  noting: { label: "Writing notes…", cls: "warn" },
  noted: { label: "Notes ready", cls: "good" },
  skipped: { label: "Not attending", cls: "warn" },
  error: { label: "Error", cls: "warn" },
};

const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

// Remembered location within the folder tree (null = top level).
let currentFolderId = null;

function sermonSub(s) {
  const parts = [];
  if (s.attended !== false) parts.push(s.kind || "Sermon");
  if (s.speaker) parts.push(s.speaker);
  parts.push(fmtDate(s.date));
  if (s.durationSec) parts.push(fmtDuration(s.durationSec));
  return parts.join(" · ");
}

async function folderPath(id) {
  const path = [];
  let fid = id;
  while (fid) {
    const f = await getFolder(fid);
    if (!f) break;
    path.unshift(f);
    fid = f.parentId;
  }
  return path;
}

function countLabel(id, folders, sermons) {
  const f = folders.filter((x) => (x.parentId || null) === id).length;
  const s = sermons.filter((x) => (x.folderId || null) === id).length;
  const parts = [];
  if (f) parts.push(`${f} folder${f > 1 ? "s" : ""}`);
  if (s) parts.push(`${s} item${s > 1 ? "s" : ""}`);
  return parts.join(" · ") || "Empty";
}

export async function renderArchive(root) {
  clear(root);
  const [folders, sermons] = await Promise.all([listFolders(), listSermons()]);
  const path = await folderPath(currentFolderId);

  // Breadcrumb
  const crumbs = el("div", { class: "row", style: "flex-wrap:wrap;gap:2px;margin-bottom:10px" });
  crumbs.append(el("button", { class: "btn ghost", style: "width:auto;padding:4px 8px", onClick: () => { currentFolderId = null; renderArchive(root); } }, "Archive"));
  for (const f of path) {
    crumbs.append(el("span", { class: "muted small", text: "›" }));
    crumbs.append(el("button", { class: "btn ghost", style: "width:auto;padding:4px 8px", onClick: () => { currentFolderId = f.id; renderArchive(root); } }, f.name));
  }
  root.append(crumbs);

  root.append(el("button", { class: "btn", style: "margin-bottom:12px", onClick: () => newFolderModal(currentFolderId, () => renderArchive(root)) }, "+ New folder"));

  const childFolders = folders.filter((f) => (f.parentId || null) === currentFolderId);
  const folderSermons = sermons.filter((s) => (s.folderId || null) === currentFolderId);

  if (!childFolders.length && !folderSermons.length) {
    root.append(el("div", { class: "empty" }, [
      el("div", { html: FOLDER_SVG }),
      el("div", { text: currentFolderId ? "This folder is empty." : "No sermons yet." }),
      el("div", { class: "small", text: currentFolderId ? "Add a folder, or move sermons here." : "Record one from the Record tab." }),
    ]));
    return;
  }

  const ul = el("ul", { class: "list" });
  for (const f of childFolders) {
    ul.append(el("li", { class: "list-item", role: "button", onClick: () => { currentFolderId = f.id; renderArchive(root); } }, [
      el("div", { class: "row" }, [
        el("span", { style: "color:var(--accent)", html: FOLDER_SVG }),
        el("div", {}, [el("div", { class: "ttl", text: f.name }), el("div", { class: "sub", text: countLabel(f.id, folders, sermons) })]),
      ]),
      el("div", { class: "row" }, [
        el("button", { class: "icon-btn", "aria-label": "Folder options", html: "⋯", onClick: (e) => { e.stopPropagation(); folderMenu(f, root); } }),
        chevron(),
      ]),
    ]));
  }
  for (const s of folderSermons) {
    const st = STATUS[s.status] || STATUS.recorded;
    ul.append(el("li", { class: "list-item", role: "button", onClick: () => renderDetail(root, s.id) }, [
      el("div", {}, [
        el("div", { class: "ttl", text: (s.quizPinned ? "📌 " : "") + s.title }),
        el("div", { class: "sub", text: sermonSub(s) }),
      ]),
      el("div", { class: "row" }, [el("span", { class: "tag " + st.cls, text: st.label }), chevron()]),
    ]));
  }
  root.append(ul);
}

// ---- Folder modals ----
async function newFolderModal(parentId, refresh) {
  const name = el("input", { type: "text", placeholder: "Folder name", autocapitalize: "words" });
  const ok = await modal({
    title: "New folder",
    body: el("div", {}, [el("label", { class: "field", text: "Name" }), name]),
    actions: [
      { label: "Cancel", class: "ghost", value: false },
      { label: "Create", class: "primary", validate: () => { if (!name.value.trim()) { name.focus(); return false; } }, value: () => true },
    ],
  });
  if (ok) { await createFolder({ name: name.value.trim(), parentId }); toast("Folder created.", "success"); refresh(); }
}

async function folderMenu(f, root) {
  const choice = await modal({
    title: f.name,
    body: el("p", { class: "small muted", text: "What would you like to do with this folder?" }),
    actions: [
      { label: "Rename", value: "rename" },
      { label: "Delete", class: "danger", value: "delete" },
      { label: "Cancel", class: "ghost", value: null },
    ],
  });
  if (choice === "rename") {
    const name = el("input", { type: "text", value: f.name, autocapitalize: "words" });
    const ok = await modal({
      title: "Rename folder",
      body: el("div", {}, [el("label", { class: "field", text: "Name" }), name]),
      actions: [{ label: "Cancel", class: "ghost", value: false }, { label: "Save", class: "primary", validate: () => { if (!name.value.trim()) return false; }, value: () => true }],
    });
    if (ok) { f.name = name.value.trim(); await saveFolder(f); renderArchive(root); }
  } else if (choice === "delete") {
    if (await confirmDialog("Delete folder?", `"${f.name}" will be removed. Its sermons and any sub-folders move up to the level above — nothing is deleted.`, { danger: true, confirmLabel: "Delete folder" })) {
      await deleteFolder(f.id);
      toast("Folder deleted.");
      renderArchive(root);
    }
  }
}

// Custom folder picker (a scrollable, indented tree).
function moveToFolderModal(s, refresh) {
  return new Promise(async (resolve) => {
    const folders = await listFolders();
    const byId = Object.fromEntries(folders.map((x) => [x.id, x]));
    const depth = (f) => { let d = 0, p = f.parentId; while (p && byId[p]) { d++; p = byId[p].parentId; } return d; };
    const rootEl = document.getElementById("modal-root");
    const close = () => { backdrop.remove(); resolve(); };
    const choose = async (folderId) => { await moveSermon(s.id, folderId); toast("Moved.", "success"); close(); refresh(); };
    const list = el("div", { class: "stack", style: "max-height:55vh;overflow:auto" });
    list.append(el("button", { class: "btn ghost", style: "justify-content:flex-start", onClick: () => choose(null) }, "↑ Top level (no folder)"));
    for (const f of folders) {
      list.append(el("button", { class: "btn ghost", style: "justify-content:flex-start;padding-left:" + (14 + depth(f) * 18) + "px", onClick: () => choose(f.id) }, "📁 " + f.name));
    }
    const card = el("div", { class: "modal" }, [
      el("div", { class: "grip" }), el("h2", { text: "Move to folder" }), list,
      el("button", { class: "btn", style: "margin-top:12px", onClick: close }, "Cancel"),
    ]);
    const backdrop = el("div", { class: "modal-backdrop", onClick: (e) => { if (e.target === backdrop) close(); } }, [card]);
    rootEl.append(backdrop);
  });
}

async function editSermonModal(s, refresh) {
  const title = el("input", { type: "text", value: s.title || "", autocapitalize: "words" });
  const kind = el("input", { type: "text", value: s.kind || "Sermon", list: "sn-kinds-edit", autocapitalize: "words" });
  const kindList = el("datalist", { id: "sn-kinds-edit" }, ["Sermon", "Bible study", "Sunday school", "Conference", "Devotional", "Other"].map((v) => el("option", { value: v })));
  const speakers = [...new Set((await listSermons()).map((x) => x.speaker).filter(Boolean))];
  const speaker = el("input", { type: "text", value: s.speaker || "", list: "sn-speakers-edit", autocapitalize: "words" });
  const speakerList = el("datalist", { id: "sn-speakers-edit" }, speakers.map((v) => el("option", { value: v })));
  const date = el("input", { type: "date", value: s.date });
  const ok = await modal({
    title: "Edit details",
    body: el("div", { class: "stack" }, [
      el("div", {}, [el("label", { class: "field", text: "Title" }), title]),
      el("div", {}, [el("label", { class: "field", text: "Type" }), kind, kindList]),
      el("div", {}, [el("label", { class: "field", text: "Speaker" }), speaker, speakerList]),
      el("div", {}, [el("label", { class: "field", text: "Date" }), date]),
    ]),
    actions: [
      { label: "Cancel", class: "ghost", value: false },
      { label: "Save", class: "primary", validate: () => { if (!title.value.trim()) { title.focus(); return false; } }, value: () => true },
    ],
  });
  if (!ok) return;
  s.title = title.value.trim();
  s.kind = kind.value.trim() || "Sermon";
  s.speaker = speaker.value.trim();
  s.date = date.value || s.date;
  await saveSermon(s);
  toast("Saved.", "success");
  refresh();
}

function renderNotes(notes) {
  if (!notes) return null;
  if (notes.raw) return el("div", { class: "notes" }, el("p", { text: notes.raw }));
  const wrap = el("div", { class: "notes stack" });
  if (notes.summary) wrap.append(el("p", { text: notes.summary }));
  if (Array.isArray(notes.scriptures) && notes.scriptures.length)
    wrap.append(el("p", { class: "small muted", text: "Scriptures: " + notes.scriptures.join(", ") }));
  for (const sec of notes.sections || []) {
    wrap.append(el("h3", { text: sec.heading || "Notes", style: "font-size:15px" }));
    wrap.append(el("ul", {}, (sec.points || []).map((p) => el("li", { text: p }))));
  }
  if (Array.isArray(notes.takeaways) && notes.takeaways.length) {
    wrap.append(el("h3", { text: "Takeaways", style: "font-size:15px" }));
    wrap.append(el("ul", {}, notes.takeaways.map((t) => el("li", { text: t }))));
  }
  return wrap;
}

async function renderDetail(root, id) {
  clear(root);
  const s = await getSermon(id);
  if (!s) return renderArchive(root);
  const refresh = () => renderDetail(root, id);

  const back = el("button", { class: "btn ghost", style: "width:auto;margin-bottom:14px", onClick: () => renderArchive(root) }, "‹ Back");
  const st = STATUS[s.status] || STATUS.recorded;

  const head = el("div", { class: "stack" }, [
    el("div", { class: "spread" }, [
      el("h2", { text: s.title }),
      el("button", { class: "btn ghost", style: "width:auto", onClick: () => editSermonModal(s, refresh) }, "Edit"),
    ]),
    el("div", { class: "row", style: "flex-wrap:wrap" }, [
      el("span", { class: "tag " + st.cls, text: st.label }),
      s.attended === false ? null : el("span", { class: "tag", text: s.kind || "Sermon" }),
      s.quizPinned ? el("span", { class: "tag accent", text: "📌 Quiz source" }) : null,
      el("span", { class: "small muted", text: fmtDate(s.date) }),
    ]),
    s.speaker ? el("div", { class: "small muted", text: "Speaker: " + s.speaker }) : null,
  ]);

  const actions = el("div", { class: "stack" });

  const blob = await getAudio(id);
  if (blob) {
    actions.append(el("audio", { controls: "", src: URL.createObjectURL(blob), style: "width:100%;margin-top:6px" }));
    if (s.transcript) {
      actions.append(el("button", {
        class: "btn ghost", style: "width:auto",
        onClick: async () => {
          if (await confirmDialog("Remove audio?", "Frees space on this device. The transcript and notes are kept.", { confirmLabel: "Remove" })) {
            await dropAudio(id); toast("Audio removed."); refresh();
          }
        },
      }, "Remove audio to free space"));
    }
  }

  if (s.attended && !s.transcript) {
    const tBtn = el("button", { class: "btn primary" }, "Transcribe audio");
    tBtn.addEventListener("click", async () => {
      if (!blob) return toast("No audio stored for this sermon.", "error");
      tBtn.replaceWith(spinnerRow("Transcribing — this can take a minute…"));
      s.status = "transcribing"; await saveSermon(s);
      try {
        const { transcript } = await transcribe(blob, s.mimeType);
        s.transcript = transcript || ""; s.status = "transcribed"; await saveSermon(s);
        toast("Transcribed.", "success");
      } catch (e) {
        s.status = "recorded"; await saveSermon(s);
        toast(e.status === 501 ? "Add your Deepgram key in Settings first." : (e.message || "Transcription failed."), "error");
      }
      refresh();
    });
    actions.append(tBtn);
  }

  if (s.transcript && !s.notes) {
    const nBtn = el("button", { class: "btn primary" }, "Generate study notes");
    nBtn.addEventListener("click", async () => {
      nBtn.replaceWith(spinnerRow("Writing notes…"));
      s.status = "noting"; await saveSermon(s);
      try {
        const { notes } = await generateNotes(s.transcript);
        s.notes = notes; s.status = "noted"; await saveSermon(s);
        embedSermon({ sermonId: s.id, title: s.title, transcript: s.transcript, notes }).catch(() => {});
        toast("Notes ready.", "success");
      } catch (e) {
        s.status = "transcribed"; await saveSermon(s);
        toast(e.status === 501 ? "Add your Gemini key in Settings first." : (e.message || "Couldn't generate notes."), "error");
      }
      refresh();
    });
    actions.append(nBtn);
  }

  if (s.transcript) {
    actions.append(el("button", { class: "btn", onClick: () => openQuiz({ type: "sermon", title: s.title, transcript: s.transcript }) }, "Quiz me on this"));
    actions.append(el("button", {
      class: s.quizPinned ? "btn primary" : "btn",
      onClick: async () => {
        await setQuizPin(s.quizPinned ? null : s.id);
        toast(s.quizPinned ? "Unpinned." : "Pinned — this is now the weekly quiz source.", "success");
        refresh();
      },
    }, s.quizPinned ? "📌 Unpin from weekly quiz" : "📌 Use for weekly quiz"));
  }

  actions.append(el("button", { class: "btn", onClick: () => moveToFolderModal(s, refresh) }, "Move to folder"));

  const content = el("div", { class: "stack" });
  if (s.notes) content.append(el("div", { class: "card" }, [el("h3", { text: "Notes" }), renderNotes(s.notes)]));
  if (s.transcript) content.append(el("div", { class: "card" }, [el("h3", { text: "Transcript" }), el("div", { class: "transcript", text: s.transcript })]));

  const exportRow = el("div", { class: "btn-row" }, [
    el("button", { class: "btn", onClick: () => exportPDF(s).catch((e) => toast(e.message || "Export failed", "error")) }, "Export PDF"),
    el("button", { class: "btn", onClick: () => exportDOCX(s).catch((e) => toast(e.message || "Export failed", "error")) }, "Export Word"),
  ]);
  const notionBtn = el("button", { class: "btn", style: "margin-top:10px" }, "Export to Notion");
  notionBtn.addEventListener("click", async () => {
    const orig = notionBtn.textContent;
    notionBtn.disabled = true; notionBtn.textContent = "Sending to Notion…";
    try {
      const { url } = await exportNotion(s);
      toast("Sent to Notion.", "success");
      if (url) window.open(url, "_blank");
    } catch (e) {
      toast(e.status === 501 ? "Add your Notion API key and target in Cloudflare first." : (e.message || "Notion export failed."), "error");
    }
    notionBtn.disabled = false; notionBtn.textContent = orig;
  });
  const delBtn = el("button", {
    class: "btn danger",
    onClick: async () => {
      if (await confirmDialog("Delete sermon?", "This removes the recording, transcript, and notes everywhere. This can't be undone.", { danger: true, confirmLabel: "Delete" })) {
        await deleteSermon(id);
        toast("Deleted.");
        renderArchive(root);
      }
    },
  }, "Delete");

  root.append(back, head, el("hr", { class: "sep" }), actions,
    (s.notes || s.transcript) ? content : el("p", { class: "muted small", text: s.attended ? "Transcribe the audio to unlock notes, quizzes, and export." : "This week was marked as not attending." }),
    el("hr", { class: "sep" }), s.attended ? exportRow : null, s.attended ? notionBtn : null, delBtn);
}

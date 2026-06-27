import { el, clear, toast, spinnerRow, fmtDate } from "../ui.js";
import { listSermons } from "../store.js";
import { search } from "../api.js";

// Phase 6 will swap this for pgvector retrieval. For now we send the local
// transcripts/notes as context so search is useful immediately.
async function buildContext() {
  const sermons = await listSermons();
  return sermons
    .filter((s) => s.transcript)
    .map((s) => {
      const notes = s.notes && !s.notes.raw
        ? [s.notes.summary, ...(s.notes.sections || []).flatMap((x) => x.points || [])].filter(Boolean).join(" ")
        : (s.notes && s.notes.raw) || "";
      return `### ${s.title} (${fmtDate(s.date)})\nNOTES: ${notes}\nTRANSCRIPT: ${s.transcript}`;
    })
    .join("\n\n");
}

export function renderSearch(root) {
  clear(root);
  const input = el("input", { type: "search", placeholder: "Ask across all your sermons…", enterkeyhint: "search" });
  const btn = el("button", { class: "btn primary" }, "Search");
  const results = el("div", { style: "margin-top:16px" });

  async function run() {
    const q = input.value.trim();
    if (!q) return;
    results.replaceChildren(spinnerRow("Searching your sermons…"));
    try {
      const context = await buildContext();
      if (!context) {
        results.replaceChildren(el("p", { class: "muted", text: "Nothing to search yet — transcribe a sermon first." }));
        return;
      }
      const { answer } = await search(q, context);
      results.replaceChildren(el("div", { class: "card" }, [
        el("div", { class: "small muted", style: "margin-bottom:8px", text: `“${q}”` }),
        el("div", { style: "white-space:pre-wrap", text: answer || "No answer." }),
      ]));
    } catch (e) {
      results.replaceChildren(el("p", { class: "muted", text: e.status === 501 ? "Add your Gemini key in Settings to enable search." : (e.message || "Search failed.") }));
    }
  }

  btn.addEventListener("click", run);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

  root.append(el("div", { class: "row", style: "gap:10px" }, [input, el("div", { style: "flex:none;width:96px" }, btn)]));
  root.append(results);
}

import { el, clear, toast, confirmDialog, fmtDate, todayISO } from "../ui.js";
import { listStudy, addStudy, deleteStudy } from "../store.js";
import { openQuiz } from "./quiz.js";

export async function renderStudy(root) {
  clear(root);

  const date = el("input", { type: "date", value: todayISO() });
  const ref = el("input", { type: "text", placeholder: "e.g. John 3:1–21", autocapitalize: "words" });
  const addBtn = el("button", { class: "btn primary" }, "Add to plan");

  addBtn.addEventListener("click", async () => {
    if (!ref.value.trim()) { ref.focus(); return toast("Enter a scripture reference.", "error"); }
    await addStudy({ date: date.value || todayISO(), reference: ref.value.trim() });
    ref.value = "";
    toast("Added.", "success");
    renderStudy(root);
  });

  root.append(el("div", { class: "card stack" }, [
    el("div", {}, [el("label", { class: "field", text: "Date" }), date]),
    el("div", {}, [el("label", { class: "field", text: "Scripture reference" }), ref]),
    addBtn,
  ]));

  const entries = await listStudy();
  if (!entries.length) {
    root.append(el("div", { class: "empty" }, [el("div", { text: "No study-plan entries yet." })]));
    return;
  }

  const ul = el("ul", { class: "list", style: "margin-top:16px" });
  for (const e of entries) {
    ul.append(el("li", { class: "list-item" }, [
      el("div", {}, [
        el("div", { class: "ttl", text: e.reference }),
        el("div", { class: "sub", text: fmtDate(e.date) }),
      ]),
      el("div", { class: "row" }, [
        el("button", { class: "btn", style: "width:auto;padding:8px 12px", onClick: () => openQuiz({ type: "study", reference: e.reference, title: e.reference }) }, "Quiz"),
        el("button", {
          class: "icon-btn", "aria-label": "Delete",
          onClick: async () => {
            if (await confirmDialog("Delete entry?", `Remove "${e.reference}" from your plan?`, { danger: true, confirmLabel: "Delete" })) {
              await deleteStudy(e.id);
              renderStudy(root);
            }
          },
          html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        }),
      ]),
    ]));
  }
  root.append(ul);
}

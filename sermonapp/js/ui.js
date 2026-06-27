// Small DOM + UI helpers shared across views.

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) { node.innerHTML = ""; return node; }

export function toast(message, type = "") {
  const root = document.getElementById("toast-root");
  const t = el("div", { class: "toast " + type, text: message });
  root.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .25s";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 260);
  }, 2600);
}

// Bottom-sheet modal. `actions` close the modal and resolve with their `value`
// (which may be a function, evaluated at click). `validate` returning false
// keeps it open. Tapping the backdrop resolves undefined.
export function modal({ title, body, actions, dismissable = true }) {
  const root = document.getElementById("modal-root");
  return new Promise((resolve) => {
    const close = (val) => { backdrop.remove(); resolve(val); };
    const actionEls = (actions || []).map((a) =>
      el("button", {
        class: "btn " + (a.class || ""),
        onClick: () => {
          if (a.validate && a.validate() === false) return;
          close(typeof a.value === "function" ? a.value() : a.value);
        },
      }, a.label)
    );
    const card = el("div", { class: "modal" }, [
      el("div", { class: "grip" }),
      title ? el("h2", { text: title }) : null,
      body,
      actionEls.length ? el("div", { class: "btn-row", style: "margin-top:18px" }, actionEls) : null,
    ]);
    const backdrop = el("div", {
      class: "modal-backdrop",
      onClick: (e) => { if (dismissable && e.target === backdrop) close(undefined); },
    }, [card]);
    root.appendChild(backdrop);
  });
}

export function confirmDialog(title, message, { danger = false, confirmLabel = "Confirm" } = {}) {
  return modal({
    title,
    body: el("p", { class: "muted", text: message }),
    actions: [
      { label: "Cancel", class: "ghost", value: false },
      { label: confirmLabel, class: danger ? "danger" : "primary", value: true },
    ],
  });
}

export function spinnerRow(text = "Working…") {
  return el("div", { class: "loading-row" }, [el("span", { class: "spinner" }), el("span", { text })]);
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function fmtDate(iso) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function chevron() {
  return el("span", { class: "chev", html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' });
}

import { json } from "./_lib.js";

// Lists every page/database your Notion integration has been shared with, so
// the app can offer a picker instead of requiring a hand-copied ID.
const NOTION_VERSION = "2022-06-28";

function titleOf(obj) {
  if (obj.object === "database") {
    return (obj.title || []).map((t) => t.plain_text).join("") || "Untitled database";
  }
  const props = obj.properties || {};
  const titleProp = Object.values(props).find((p) => p && p.type === "title");
  const text = titleProp && titleProp.title ? titleProp.title.map((t) => t.plain_text).join("") : "";
  return text || "Untitled page";
}

export async function onRequestGet({ env }) {
  if (!env.NOTION_API_KEY) return json({ error: "Add NOTION_API_KEY first." }, 501);

  const headers = {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  try {
    const r = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers,
      body: JSON.stringify({ page_size: 100, sort: { direction: "descending", timestamp: "last_edited_time" } }),
    });
    if (!r.ok) return json({ error: "Notion error: " + (await r.text()) }, 502);
    const data = await r.json();
    const items = (data.results || [])
      .filter((o) => o.object === "page" || o.object === "database")
      .map((o) => ({ id: o.id, type: o.object, title: titleOf(o) }));
    return json({ items });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

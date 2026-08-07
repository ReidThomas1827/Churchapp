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

// Notion reports a parent as one of workspace / page_id / database_id / block_id.
// Only page and database parents can be shown as tree branches; anything else
// (including workspace roots) becomes a top-level entry.
function parentIdOf(obj) {
  const p = obj.parent || {};
  if (p.type === "page_id") return p.page_id;
  if (p.type === "database_id") return p.database_id;
  return null;
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
      .map((o) => ({ id: o.id, type: o.object, title: titleOf(o), parentId: parentIdOf(o) }));
    return json({ items });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

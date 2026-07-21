import { json } from "./_lib.js";

// Exports a sermon to Notion as a new page — under a page (as a sub-page) or
// into a database (as a row), whichever NOTION_TARGET_ID points to. The type
// is auto-detected so this works with either kind of destination.
const NOTION_VERSION = "2022-06-28";

const notionHeaders = (env) => ({
  Authorization: `Bearer ${env.NOTION_API_KEY}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
});

function textBlock(type, content, extra = {}) {
  return { object: "block", type, [type]: { rich_text: [{ type: "text", text: { content: String(content).slice(0, 2000) } }], ...extra } };
}

// Splits long text into <=1900-char paragraph blocks (Notion's per-text-object cap is 2000).
function chunk(text, size = 1900) {
  const t = String(text || "");
  const out = [];
  for (let i = 0; i < t.length; i += size) out.push(t.slice(i, i + size));
  return out;
}

function sermonToBlocks(sermon) {
  const blocks = [];
  const meta = [sermon.attended === false ? "Not attended" : (sermon.kind || "Sermon"), sermon.speaker, sermon.date].filter(Boolean).join(" · ");
  if (meta) blocks.push(textBlock("paragraph", meta));

  const n = sermon.notes;
  if (n && !n.raw) {
    if (n.summary) {
      blocks.push(textBlock("heading_2", "Summary"));
      for (const c of chunk(n.summary)) blocks.push(textBlock("paragraph", c));
    }
    if (Array.isArray(n.scriptures) && n.scriptures.length) {
      blocks.push(textBlock("heading_2", "Scriptures"));
      blocks.push(textBlock("paragraph", n.scriptures.join(", ")));
    }
    for (const sec of n.sections || []) {
      blocks.push(textBlock("heading_3", sec.heading || "Notes"));
      for (const p of sec.points || []) blocks.push(textBlock("bulleted_list_item", p));
    }
    if (Array.isArray(n.takeaways) && n.takeaways.length) {
      blocks.push(textBlock("heading_2", "Takeaways"));
      for (const t of n.takeaways) blocks.push(textBlock("bulleted_list_item", t));
    }
  } else if (n && n.raw) {
    blocks.push(textBlock("heading_2", "Notes"));
    for (const c of chunk(n.raw)) blocks.push(textBlock("paragraph", c));
  }

  if (sermon.transcript) {
    blocks.push(textBlock("heading_2", "Transcript"));
    for (const c of chunk(sermon.transcript)) blocks.push(textBlock("paragraph", c));
  }
  return blocks;
}

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_API_KEY) return json({ error: "Notion export isn't configured. Add NOTION_API_KEY." }, 501);

  const body = await request.json().catch(() => null);
  if (!body || !body.title) return json({ error: "Sermon data required." }, 400);
  const { targetId: bodyTargetId, targetType, ...sermon } = body;

  // targetId/targetType come from the in-app picker (preferred). Fall back to the
  // legacy NOTION_TARGET_ID env var (auto-detecting page vs database) if set.
  const targetId = bodyTargetId || env.NOTION_TARGET_ID;
  if (!targetId) return json({ error: "Choose a Notion destination first." }, 400);
  const headers = notionHeaders(env);

  let parent, properties;
  let db = null;
  if (targetType === "database") {
    const r = await fetch(`https://api.notion.com/v1/databases/${targetId}`, { headers });
    db = r.ok ? await r.json() : { properties: {} };
  } else if (!targetType) {
    const r = await fetch(`https://api.notion.com/v1/databases/${targetId}`, { headers });
    if (r.ok) db = await r.json();
  }
  if (db) {
    const titleProp = Object.entries(db.properties || {}).find(([, v]) => v.type === "title");
    const titleKey = titleProp ? titleProp[0] : "Name";
    parent = { database_id: targetId };
    properties = { [titleKey]: { title: [{ text: { content: sermon.title } }] } };
  } else {
    parent = { page_id: targetId };
    properties = { title: { title: [{ text: { content: sermon.title } }] } };
  }

  const allBlocks = sermonToBlocks(sermon);
  const createRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({ parent, properties, children: allBlocks.slice(0, 100) }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    const hint = createRes.status === 404 || createRes.status === 403
      ? " (Make sure you've shared the target page/database with your Notion integration — Notion won't allow access otherwise.)"
      : "";
    return json({ error: "Notion error: " + errText + hint }, 502);
  }
  const page = await createRes.json();

  // Notion caps page-creation children at 100 blocks; append the rest afterward.
  for (let i = 100; i < allBlocks.length; i += 100) {
    await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ children: allBlocks.slice(i, i + 100) }),
    }).catch(() => {});
  }

  return json({ url: page.url });
}

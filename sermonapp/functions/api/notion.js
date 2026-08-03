import { json } from "./_lib.js";

// Exports a sermon to Notion as a well-structured page — a sub-page (under a
// page) or a row (in a database), whichever NOTION_TARGET_ID/targetId points
// to. Pages get an icon, a real table of contents, and collapsible sections
// instead of a flat wall of text. Database targets get real Date/Speaker/Type
// columns (auto-added if the database doesn't already have them) so sermons
// become sortable/filterable rows, not just titled pages.
const NOTION_VERSION = "2022-06-28";

const notionHeaders = (env) => ({
  Authorization: `Bearer ${env.NOTION_API_KEY}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
});

function rt(content) {
  return [{ type: "text", text: { content: String(content).slice(0, 2000) } }];
}
function block(type, extra) {
  return { object: "block", type, [type]: extra };
}
function textBlock(type, content, extra = {}) {
  return block(type, { rich_text: rt(content), ...extra });
}
function toggle(title, children) {
  return block("toggle", { rich_text: rt(title), children });
}

// Splits long text into <=1900-char paragraph blocks (Notion's per-text-object cap is 2000).
function chunk(text, size = 1900) {
  const t = String(text || "");
  const out = [];
  for (let i = 0; i < t.length; i += size) out.push(t.slice(i, i + size));
  return out.length ? out : [""];
}

function sermonToBlocks(sermon) {
  const blocks = [];
  const meta = [sermon.attended === false ? "Not attended" : (sermon.kind || "Sermon"), sermon.speaker, sermon.date].filter(Boolean).join("  ·  ");

  blocks.push(block("callout", {
    rich_text: rt(meta || "Sermon"),
    icon: { type: "emoji", emoji: "🗓️" },
    color: "gray_background",
  }));
  blocks.push(block("table_of_contents", {}));

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
      const points = (sec.points || []).map((p) => textBlock("bulleted_list_item", p));
      blocks.push(toggle(sec.heading || "Section", points.length ? points : [textBlock("paragraph", "—")]));
    }
    if (Array.isArray(n.takeaways) && n.takeaways.length) {
      blocks.push(textBlock("heading_2", "Takeaways"));
      for (const t of n.takeaways) blocks.push(textBlock("bulleted_list_item", t));
    }
  } else if (n && n.raw) {
    blocks.push(toggle("Notes", chunk(n.raw).map((c) => textBlock("paragraph", c))));
  }

  if (sermon.transcript) {
    blocks.push(toggle("Transcript", chunk(sermon.transcript).map((c) => textBlock("paragraph", c))));
  }
  return blocks;
}

// Finds an existing database property by name (case-insensitive, any of the
// given aliases), or returns null if none matches.
function findProp(properties, aliases) {
  const entry = Object.entries(properties || {}).find(([k]) => aliases.includes(k.toLowerCase()));
  return entry ? { key: entry[0], type: entry[1].type } : null;
}

function valueForProp(type, value) {
  if (value == null || value === "") return null;
  if (type === "date") return { date: { start: value } };
  if (type === "select") return { select: { name: String(value).slice(0, 100) } };
  if (type === "multi_select") return { multi_select: [{ name: String(value).slice(0, 100) }] };
  if (type === "rich_text") return { rich_text: rt(value) };
  return null; // unsupported property type for auto-fill (e.g. formula, relation) — skip rather than error
}

// Ensures the database has Date/Speaker/Type columns (adding any that are
// missing), then returns the property assignments to set on the new row.
async function buildDatabaseProperties(env, headers, targetId, db, sermon, titleKey) {
  const props = db.properties || {};
  const dateP = findProp(props, ["date"]);
  const speakerP = findProp(props, ["speaker"]);
  const typeP = findProp(props, ["type", "kind"]);

  const toAdd = {};
  if (!dateP) toAdd.Date = { date: {} };
  if (!speakerP) toAdd.Speaker = { select: {} };
  if (!typeP) toAdd.Type = { select: {} };

  if (Object.keys(toAdd).length) {
    await fetch(`https://api.notion.com/v1/databases/${targetId}`, {
      method: "PATCH", headers, body: JSON.stringify({ properties: toAdd }),
    }).catch(() => {}); // best-effort; if it fails we just skip those columns below
  }

  const finalDate = dateP || (toAdd.Date ? { key: "Date", type: "date" } : null);
  const finalSpeaker = speakerP || (toAdd.Speaker ? { key: "Speaker", type: "select" } : null);
  const finalType = typeP || (toAdd.Type ? { key: "Type", type: "select" } : null);

  const properties = { [titleKey]: { title: rt(sermon.title) } };
  if (finalDate) { const v = valueForProp(finalDate.type, sermon.date); if (v) properties[finalDate.key] = v; }
  if (finalSpeaker) { const v = valueForProp(finalSpeaker.type, sermon.speaker); if (v) properties[finalSpeaker.key] = v; }
  if (finalType) { const v = valueForProp(finalType.type, sermon.attended === false ? "Not attended" : (sermon.kind || "Sermon")); if (v) properties[finalType.key] = v; }
  return properties;
}

export async function onRequestPost({ request, env }) {
  if (!env.NOTION_API_KEY) return json({ error: "Notion export isn't configured. Add NOTION_API_KEY." }, 501);

  const body = await request.json().catch(() => null);
  if (!body || !body.title) return json({ error: "Sermon data required." }, 400);
  const { targetId: bodyTargetId, targetType, ...sermon } = body;

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
    properties = await buildDatabaseProperties(env, headers, targetId, db, sermon, titleKey);
  } else {
    parent = { page_id: targetId };
    properties = { title: { title: rt(sermon.title) } };
  }

  const allBlocks = sermonToBlocks(sermon);
  const createRes = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({ parent, properties, icon: { type: "emoji", emoji: "📖" }, children: allBlocks.slice(0, 100) }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    const hint = createRes.status === 404 || createRes.status === 403
      ? " (Make sure you've shared the target page/database with your Notion integration — Notion won't allow access otherwise.)"
      : "";
    return json({ error: "Notion error: " + errText + hint }, 502);
  }
  const page = await createRes.json();

  // Notion caps page-creation children at 100 top-level blocks; append any rest.
  for (let i = 100; i < allBlocks.length; i += 100) {
    await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ children: allBlocks.slice(i, i + 100) }),
    }).catch(() => {});
  }

  return json({ url: page.url });
}

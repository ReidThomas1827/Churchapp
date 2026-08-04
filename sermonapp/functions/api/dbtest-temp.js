import { json } from "./_lib.js";

// TEMPORARY — verifies the auto-column logic in notion.js against a real
// database. Delete this file after testing.
export async function onRequestPost({ env }) {
  const headers = {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
  const r = await fetch("https://api.notion.com/v1/databases", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { type: "page_id", page_id: "3a4c700e-7951-80b2-9a28-c78723007a90" },
      title: [{ type: "text", text: { content: "TEMP export test DB" } }],
      properties: { Name: { title: {} } },
    }),
  });
  return json(await r.json());
}

// Inspect a database's columns and its rows' values.
export async function onRequestGet({ env, request }) {
  const id = new URL(request.url).searchParams.get("id");
  const headers = {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
  const db = await fetch(`https://api.notion.com/v1/databases/${id}`, { headers }).then((r) => r.json());
  const rows = await fetch(`https://api.notion.com/v1/databases/${id}/query`, { method: "POST", headers, body: "{}" }).then((r) => r.json());
  const columns = Object.entries(db.properties || {}).map(([k, v]) => `${k}:${v.type}`);
  const firstRow = (rows.results || [])[0];
  const values = firstRow
    ? Object.entries(firstRow.properties).map(([k, v]) => {
        let val = "";
        if (v.type === "title") val = (v.title || []).map((t) => t.plain_text).join("");
        else if (v.type === "date") val = v.date ? v.date.start : "";
        else if (v.type === "select") val = v.select ? v.select.name : "";
        else if (v.type === "rich_text") val = (v.rich_text || []).map((t) => t.plain_text).join("");
        return `${k}=${val}`;
      })
    : [];
  const blocks = firstRow
    ? await fetch(`https://api.notion.com/v1/blocks/${firstRow.id}/children`, { headers })
        .then((r) => r.json())
        .then((b) => (b.results || []).map((x) => x.type))
    : [];
  return json({ columns, rowValues: values, pageIcon: firstRow && firstRow.icon, blockTypes: blocks });
}

export async function onRequestDelete({ env, request }) {
  const { id } = await request.json();
  const headers = {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
  const r = await fetch(`https://api.notion.com/v1/blocks/${id}`, { method: "DELETE", headers });
  return json(await r.json());
}

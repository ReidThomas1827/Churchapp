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

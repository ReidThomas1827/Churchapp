import { json } from "./_lib.js";

// TEMPORARY — lists the child pages of a given Notion page, to verify real
// structure before a bulk operation. Delete after use.
export async function onRequestGet({ env, request }) {
  const id = new URL(request.url).searchParams.get("id");
  const headers = {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
  };
  const r = await fetch(`https://api.notion.com/v1/blocks/${id}/children?page_size=100`, { headers });
  const data = await r.json();
  const children = (data.results || [])
    .filter((b) => b.type === "child_page" || b.type === "child_database")
    .map((b) => ({ id: b.id, type: b.type, title: b.child_page?.title || b.child_database?.title || "" }));
  return json({ children });
}

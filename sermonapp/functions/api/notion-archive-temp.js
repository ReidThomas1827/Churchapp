import { json } from "./_lib.js";

// TEMPORARY: moves a Notion page to the trash (recoverable), used once to clean
// up a diagnostic export. Gated behind CRON_SECRET. Delete this file after use.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env.CRON_SECRET || url.searchParams.get("key") !== env.CRON_SECRET) return json({ error: "unauthorized" }, 401);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  const r = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ archived: true }),
  });
  return json({ ok: r.ok, status: r.status, body: await r.text() }, r.ok ? 200 : 502);
}

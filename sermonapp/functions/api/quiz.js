import { json, gemini } from "./_lib.js";

// Fetches the actual verse text for a reference like "John 3:1-21" from the
// free, keyless bible-api.com, so study quizzes have real material to draw
// from instead of just the reference string (which left the AI quizzing from
// its own memory of the passage — a major source of repeated questions).
async function fetchScripture(reference) {
  try {
    const clean = String(reference).trim().replace(/[‒-―−]/g, "-"); // normalize en/em dashes to "-"
    const url = "https://bible-api.com/" + encodeURIComponent(clean).replace(/%20/g, "+") + "?translation=web";
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    return data && data.text ? data.text.trim() : null;
  } catch {
    return null;
  }
}

function notesToText(notes) {
  if (!notes || notes.raw) return notes && notes.raw ? notes.raw : "";
  const parts = [];
  if (notes.summary) parts.push("Summary: " + notes.summary);
  if (Array.isArray(notes.scriptures) && notes.scriptures.length) parts.push("Scriptures referenced: " + notes.scriptures.join(", "));
  for (const sec of notes.sections || []) parts.push((sec.heading || "Section") + ": " + (sec.points || []).join("; "));
  if (Array.isArray(notes.takeaways) && notes.takeaways.length) parts.push("Takeaways: " + notes.takeaways.join("; "));
  return parts.join("\n");
}

// Pick a random, concrete "focus" from the notes (a specific section heading or
// takeaway) so each day's quiz is anchored to a genuinely different angle,
// rather than hoping temperature alone produces variety.
function pickFocus(notes) {
  if (!notes || notes.raw) return null;
  const candidates = [
    ...(notes.sections || []).map((s) => s.heading).filter(Boolean),
    ...(notes.takeaways || []),
  ];
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY)
    return json({ error: "Quizzes not configured. Add GEMINI_API_KEY in Cloudflare." }, 501);

  const src = await request.json().catch(() => ({}));
  const seed = Math.random().toString(36).slice(2, 8);
  let basis, focusLine = "";

  if (src.type === "study" && src.reference) {
    const text = await fetchScripture(src.reference);
    basis = text
      ? `this Bible passage, ${src.reference}:\n"""${text}"""`
      : `the Bible passage: ${src.reference} (use your general biblical knowledge of this passage — its exact text couldn't be fetched)`;
  } else if (src.transcript) {
    const notesText = notesToText(src.notes);
    basis = `this sermon transcript:\n"""${String(src.transcript).slice(0, 22000)}"""`;
    if (notesText) basis += `\n\nHere are the study notes already generated from it, covering its main points, scriptures, and takeaways:\n"""${notesText.slice(0, 4000)}"""`;
    const focus = pickFocus(src.notes);
    if (focus) focusLine = `\nFor THIS quiz specifically, weight your questions toward this angle: "${focus}" — but you may still include one or two questions from elsewhere in the material.`;
  } else {
    return json({ error: "Nothing to quiz on." }, 400);
  }

  const prompt = `Create a fresh 5-question multiple-choice quiz based on ${basis}.
Make this quiz DIFFERENT from any previous quiz on the same material: cover different points, details, angles, and applications, and vary the difficulty. Don't reuse the same questions each time.${focusLine}
(Variety seed: ${seed}.)
Return ONLY JSON matching:
{"questions":[{"q": string, "choices": [string, string, string, string], "answer": number, "explanation": string}]}
"answer" is the 0-based index of the correct choice. Keep questions faithful to the source.`;

  try {
    const data = await gemini(env, prompt, { wantJSON: true, temperature: 1.1 });
    return json({ questions: data.questions || [] });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

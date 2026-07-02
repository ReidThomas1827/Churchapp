import { json, gemini } from "./_lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY)
    return json({ error: "Quizzes not configured. Add GEMINI_API_KEY in Cloudflare." }, 501);

  const src = await request.json().catch(() => ({}));
  let basis;
  if (src.type === "study" && src.reference) basis = `the Bible passage: ${src.reference}`;
  else if (src.transcript) basis = `this sermon transcript:\n"""${String(src.transcript).slice(0, 24000)}"""`;
  else return json({ error: "Nothing to quiz on." }, 400);

  const seed = Math.random().toString(36).slice(2, 8);
  const prompt = `Create a fresh 5-question multiple-choice quiz based on ${basis}.
Make this quiz DIFFERENT from any previous quiz on the same material: cover different points, details, angles, and applications, and vary the difficulty. Don't reuse the same questions each time. (Variety seed: ${seed}.)
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

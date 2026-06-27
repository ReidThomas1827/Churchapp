import { el, modal, toast } from "../ui.js";
import { generateQuiz } from "../api.js";
import { addQuizResult } from "../store.js";

// source: { type:"sermon", title, transcript } | { type:"study", reference, title }
export async function openQuiz(source) {
  toast("Building your quiz…");
  let data;
  try {
    data = await generateQuiz(source);
  } catch (e) {
    toast(e.status === 501 ? "Add your Gemini key in Settings first." : (e.message || "Couldn't build the quiz."), "error");
    return;
  }
  const questions = (data && data.questions) || [];
  if (!questions.length) return toast("No questions were generated.", "error");
  runQuiz(questions, source);
}

function correctIndex(q, choices) {
  if (typeof q.answer === "number") return q.answer;
  const a = String(q.answer ?? q.correct ?? "").trim();
  if (/^[A-D]$/i.test(a)) return a.toUpperCase().charCodeAt(0) - 65;
  const i = choices.findIndex((c) => String(c).trim().toLowerCase() === a.toLowerCase());
  return i >= 0 ? i : 0;
}

function runQuiz(questions, source) {
  const title = source.title || "Quiz";
  const picks = questions.map(() => null);
  const refs = [];
  const body = el("div", { style: "max-height:68vh;overflow:auto" });

  questions.forEach((q, qi) => {
    const choices = q.choices || q.options || [];
    const card = el("div", { class: "card" });
    card.append(el("div", { style: "font-weight:650;margin-bottom:10px", text: `${qi + 1}. ${q.q || q.question || ""}` }));
    const labels = choices.map((c, ci) => {
      const input = el("input", { type: "radio", name: "q" + qi, style: "width:auto;margin-top:3px", onChange: () => (picks[qi] = ci) });
      const label = el("label", { class: "row", style: "padding:7px 0;align-items:flex-start;gap:10px" }, [input, el("span", { text: c })]);
      card.append(label);
      return label;
    });
    const explain = el("div", { class: "small muted", style: "margin-top:6px", hidden: true });
    card.append(explain);
    refs.push({ choices, labels, explain });
    body.append(card);
  });

  const submit = el("button", { class: "btn primary" }, "Check answers");
  body.append(submit);

  submit.addEventListener("click", () => {
    let score = 0;
    questions.forEach((q, qi) => {
      const { choices, labels, explain } = refs[qi];
      const correct = correctIndex(q, choices);
      if (picks[qi] === correct) score++;
      labels.forEach((label, ci) => {
        label.querySelectorAll("input").forEach((i) => (i.disabled = true));
        if (ci === correct) label.style.color = "var(--good)";
        else if (ci === picks[qi]) label.style.color = "var(--danger)";
      });
      if (q.explanation) { explain.textContent = q.explanation; explain.hidden = false; }
    });
    addQuizResult({ sourceType: source.type, title, score, total: questions.length }).catch(() => {});
    submit.replaceWith(el("div", { class: "card center", style: "font-weight:700" }, `You scored ${score} / ${questions.length}`));
    body.scrollTop = 0;
  });

  modal({ title, body, actions: [{ label: "Done", class: "ghost", value: true }] });
}

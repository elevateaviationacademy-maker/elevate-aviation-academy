import fs from "fs";
import path from "path";

let cache = null;
let loadError = null;

function loadBank() {
  if (cache) return cache;
  if (loadError) throw loadError;
  try {
    const file = path.join(process.cwd(), "data", "questions.json");
    cache = JSON.parse(fs.readFileSync(file, "utf-8"));
    return cache;
  } catch (err) {
    loadError = new Error(
      "Question bank could not be loaded (data/questions.json missing or invalid). " + err.message
    );
    throw loadError;
  }
}

// Returns { subject: { chapter: count, ... totalCount }, ... }
export function getSubjectTree() {
  const bank = loadBank();
  const tree = {};
  for (const [subject, authors] of Object.entries(bank)) {
    const chapters = {};
    for (const chapterMap of Object.values(authors)) {
      for (const [chapter, qs] of Object.entries(chapterMap)) {
        chapters[chapter] = (chapters[chapter] || 0) + qs.length;
      }
    }
    const total = Object.values(chapters).reduce((a, b) => a + b, 0);
    tree[subject] = { chapters, total };
  }
  return tree;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pulls `count` random questions from `subject`, optionally restricted to `chapters`.
export function generatePaper(subject, chapters, count) {
  const bank = loadBank();
  const authors = bank[subject];
  if (!authors) return [];

  let pool = [];
  for (const chapterMap of Object.values(authors)) {
    for (const [chapter, qs] of Object.entries(chapterMap)) {
      if (chapters && chapters.length && !chapters.includes(chapter)) continue;
      qs.forEach((q, idx) => {
        // filter out any blank/malformed options
        const options = (q.options || []).map((o) => (o || "").trim()).filter(Boolean);
        if (!q.question || options.length < 2 || !q.correct_answer) return;
        pool.push({
          id: `${subject}|${chapter}|${idx}`,
          chapter,
          question: q.question,
          options: shuffle(options),
          correct_answer: q.correct_answer,
        });
      });
    }
  }

  pool = shuffle(pool);
  return pool.slice(0, Math.min(count, pool.length));
}

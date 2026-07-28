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

// Returns { subject: { chapters, total } }. customQuestions is the optional
// array from Supabase's custom_questions table (fetched by the caller) —
// merged in alongside the static bank so counts reflect both sources.
export function getSubjectTree(customQuestions = []) {
  const bank = loadBank();
  const tree = {};
  for (const [subject, authors] of Object.entries(bank)) {
    const chapters = {};
    for (const chapterMap of Object.values(authors)) {
      for (const [chapter, qs] of Object.entries(chapterMap)) {
        chapters[chapter] = (chapters[chapter] || 0) + qs.length;
      }
    }
    tree[subject] = { chapters, total: 0 }; // total recomputed below after merge
  }
  for (const cq of customQuestions) {
    tree[cq.subject] = tree[cq.subject] || { chapters: {}, total: 0 };
    tree[cq.subject].chapters[cq.chapter] = (tree[cq.subject].chapters[cq.chapter] || 0) + 1;
  }
  for (const info of Object.values(tree)) {
    info.total = Object.values(info.chapters).reduce((a, b) => a + b, 0);
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

// Pulls `count` random questions from `subject`, optionally restricted to
// `chapters`. customQuestions (optional) is merged into the same pool before
// shuffling, so instructor-added questions can turn up in any exam just like
// bank questions — same validation rules apply to both.
export function generatePaper(subject, chapters, count, customQuestions = []) {
  const bank = loadBank();
  const authors = bank[subject];

  let pool = [];
  if (authors) {
    for (const chapterMap of Object.values(authors)) {
      for (const [chapter, qs] of Object.entries(chapterMap)) {
        if (chapters && chapters.length && !chapters.includes(chapter)) continue;
        qs.forEach((q, idx) => {
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
  }

  customQuestions
    .filter((cq) => cq.subject === subject && (!chapters || !chapters.length || chapters.includes(cq.chapter)))
    .forEach((cq) => {
      const options = (cq.options || []).map((o) => (o || "").trim()).filter(Boolean);
      if (!cq.question || options.length < 2 || !cq.correct_answer) return;
      pool.push({
        id: `custom|${cq.id}`,
        chapter: cq.chapter,
        question: cq.question,
        options: shuffle(options),
        correct_answer: cq.correct_answer,
      });
    });

  pool = shuffle(pool);
  return pool.slice(0, Math.min(count, pool.length));
}

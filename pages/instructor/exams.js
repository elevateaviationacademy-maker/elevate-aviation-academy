import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";

const COUNT_OPTIONS = [10, 20, 30, 50];
const DURATION_OPTIONS = [10, 20, 30, 45, 60, 90];

export default function InstructorExams() {
  const router = useRouter();
  const [tree, setTree] = useState(null);
  const [bankError, setBankError] = useState("");
  const [exams, setExams] = useState([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [count, setCount] = useState(20);
  const [duration, setDuration] = useState(20);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState({});

  // Custom question creator
  const [qChapter, setQChapter] = useState("");
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState(["", "", "", ""]);
  const [qCorrectIndex, setQCorrectIndex] = useState(0);
  const [qSaving, setQSaving] = useState(false);
  const [qMessage, setQMessage] = useState("");
  const [customList, setCustomList] = useState([]);

  useEffect(() => {
    guardAndLoad();
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role !== "instructor") return router.replace("/student/dashboard");

    const res = await fetch("/api/exam/subjects");
    const json = await res.json();
    if (!res.ok) {
      setBankError(json.error || "Could not load the question bank.");
    } else {
      setTree(json);
      const firstSubject = Object.keys(json)[0];
      if (firstSubject) setSubject(firstSubject);
    }

    loadExams();
  }

  async function loadExams() {
    const { data } = await supabase.from("exams").select("*").order("created_at", { ascending: false });
    setExams(data || []);
    loadStats();
  }

  async function loadStats() {
    const { data } = await supabase
      .from("exam_attempts")
      .select("exam_id, score")
      .eq("status", "submitted");
    const grouped = {};
    (data || []).forEach((a) => {
      grouped[a.exam_id] = grouped[a.exam_id] || [];
      grouped[a.exam_id].push(a.score);
    });
    const avg = {};
    Object.entries(grouped).forEach(([examId, scores]) => {
      avg[examId] = {
        avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      };
    });
    setStats(avg);
  }

  function toggleChapter(ch) {
    setSelectedChapters((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  }

  useEffect(() => {
    if (subject) loadCustomQuestions(subject);
  }, [subject]);

  async function loadCustomQuestions(subj) {
    const { data } = await supabase
      .from("custom_questions")
      .select("*")
      .eq("subject", subj)
      .order("created_at", { ascending: false });
    setCustomList(data || []);
  }

  function updateOption(idx, val) {
    setQOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
  }

  function addOption() {
    if (qOptions.length >= 6) return;
    setQOptions((prev) => [...prev, ""]);
  }

  function removeOption(idx) {
    if (qOptions.length <= 2) return;
    setQOptions((prev) => prev.filter((_, i) => i !== idx));
    setQCorrectIndex((prev) => (prev === idx ? 0 : prev > idx ? prev - 1 : prev));
  }

  function resetQuestionForm() {
    setQChapter("");
    setQText("");
    setQOptions(["", "", "", ""]);
    setQCorrectIndex(0);
  }

  async function submitQuestion(e) {
    e.preventDefault();
    setQMessage("");
    const cleanOptions = qOptions.map((o) => o.trim()).filter(Boolean);
    if (!qChapter.trim()) return setQMessage("Error: chapter name is required.");
    if (!qText.trim()) return setQMessage("Error: question text is required.");
    if (cleanOptions.length < 2) return setQMessage("Error: at least 2 non-empty options are required.");
    const correctText = qOptions[qCorrectIndex]?.trim();
    if (!correctText) return setQMessage("Error: pick a correct answer that has text filled in.");

    setQSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.from("custom_questions").insert({
      subject,
      chapter: qChapter.trim(),
      question: qText.trim(),
      options: cleanOptions,
      correct_answer: correctText,
      created_by: sessionData.session.user.id,
    });
    setQSaving(false);
    if (error) return setQMessage("Error: " + error.message);
    setQMessage("Question added — it'll now show up in the pool for any exam on this subject.");
    resetQuestionForm();
    loadCustomQuestions(subject);
    // Refresh the bank tree so the question-count shown next to the subject updates too.
    const res = await fetch("/api/exam/subjects");
    const json = await res.json();
    if (res.ok) setTree(json);
  }

  async function deleteCustomQuestion(id) {
    if (!confirm("Delete this question? It will no longer be pulled into any exam paper.")) return;
    await supabase.from("custom_questions").delete().eq("id", id);
    loadCustomQuestions(subject);
    const res = await fetch("/api/exam/subjects");
    const json = await res.json();
    if (res.ok) setTree(json);
  }

  async function createExam(e) {
    e.preventDefault();
    setCreating(true);
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { error } = await supabase.from("exams").insert({
        title: title || `${subject} Practice Exam`,
        subject,
        chapters: selectedChapters,
        question_count: count,
        duration_minutes: duration,
        is_active: false,
        created_by: sessionData.session.user.id,
      });
      if (error) throw error;
      setMessage("Exam created. Grant access and open the gate to let students take it.");
      setTitle("");
      setSelectedChapters([]);
      loadExams();
    } catch (err) {
      setMessage("Error: " + err.message);
    }
    setCreating(false);
  }

  async function toggleActive(exam) {
    await supabase.from("exams").update({ is_active: !exam.is_active }).eq("id", exam.id);
    loadExams();
  }

  async function deleteExam(id) {
    if (!confirm("Delete this exam? All student attempts for it will also be removed.")) return;
    await supabase.from("exams").delete().eq("id", id);
    loadExams();
  }

  async function duplicateExam(exam) {
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.from("exams").insert({
      title: `${exam.title} (copy)`,
      subject: exam.subject,
      chapters: exam.chapters,
      question_count: exam.question_count,
      duration_minutes: exam.duration_minutes,
      is_active: false,
      created_by: sessionData.session.user.id,
    });
    if (error) return setMessage("Error: " + error.message);
    setMessage("Duplicated. New copy is closed — open it and grant access when ready.");
    loadExams();
  }

  if (bankError) {
    return (
      <div>
        <Navbar role="instructor" />
        <div className="container">
          <p className="error">{bankError}</p>
          <p style={{ color: "#64748b", fontSize: 13 }}>
            Check that <code>data/questions.json</code> exists in the deployed app and is valid JSON.
            Existing exams and their results are unaffected — only creating new exams needs the bank.
          </p>
        </div>
      </div>
    );
  }

  if (!tree) {
    return (
      <div>
        <Navbar role="instructor" />
        <div className="container"><p className="loading-row"><span className="spinner dark" />Loading question bank…</p></div>
      </div>
    );
  }

  const chapters = subject ? Object.keys(tree[subject]?.chapters || {}) : [];

  return (
    <div>
      <Navbar role="instructor" />
      <div className="container">
        <h2>Create Exam</h2>
        <div className="card">
          {message && <p className={message.startsWith("Error") ? "error" : "success"}>{message}</p>}
          <form onSubmit={createExam}>
            <input
              placeholder="Exam title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <label style={{ fontSize: 13, color: "#64748b" }}>Subject</label>
            <select value={subject} onChange={(e) => { setSubject(e.target.value); setSelectedChapters([]); }}>
              {Object.entries(tree).map(([s, info]) => (
                <option key={s} value={s}>{s} ({info.total} questions)</option>
              ))}
            </select>

            <label style={{ fontSize: 13, color: "#64748b" }}>Chapters (optional — leave blank for all)</label>
            <div style={{ marginBottom: 12 }}>
              {chapters.map((ch) => (
                <span
                  key={ch}
                  className={"chip" + (selectedChapters.includes(ch) ? " active" : "")}
                  onClick={() => toggleChapter(ch)}
                >
                  {ch}
                </span>
              ))}
            </div>

            <label style={{ fontSize: 13, color: "#64748b" }}>Number of questions</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {COUNT_OPTIONS.map((c) => (
                <span key={c} className={"chip" + (count === c ? " active" : "")} onClick={() => setCount(c)}>{c}</span>
              ))}
            </div>

            <label style={{ fontSize: 13, color: "#64748b" }}>Duration (minutes)</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {DURATION_OPTIONS.map((d) => (
                <span key={d} className={"chip" + (duration === d ? " active" : "")} onClick={() => setDuration(d)}>{d}</span>
              ))}
            </div>

            <button type="submit" disabled={creating}>{creating ? "Creating…" : "Create Exam"}</button>
          </form>
        </div>

        <h2>Add Your Own Question — {subject}</h2>
        <div className="card">
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
            Questions you add here are stored right alongside the built-in question bank and get pulled into any
            exam on this subject, same as the rest — including auto-grading and the answer key. Every question
            needs a marked correct answer; there's no ungraded/manual-review question type in this exam engine.
          </p>
          {qMessage && <p className={qMessage.startsWith("Error") ? "error" : "success"}>{qMessage}</p>}
          <form onSubmit={submitQuestion}>
            <label style={{ fontSize: 13, color: "#64748b" }}>Chapter</label>
            <input
              placeholder="e.g. Pressure, Atmosphere, RTF Phraseology…"
              value={qChapter}
              onChange={(e) => setQChapter(e.target.value)}
            />

            <label style={{ fontSize: 13, color: "#64748b" }}>Question</label>
            <textarea
              placeholder="Type the question here"
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              style={{ minHeight: 60 }}
            />

            <label style={{ fontSize: 13, color: "#64748b" }}>Options — select the radio button next to the correct one</label>
            {qOptions.map((opt, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  type="radio"
                  name="correctOption"
                  checked={qCorrectIndex === idx}
                  onChange={() => setQCorrectIndex(idx)}
                />
                <input
                  placeholder={`Option ${idx + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                {qOptions.length > 2 && (
                  <button type="button" className="secondary" onClick={() => removeOption(idx)}>✕</button>
                )}
              </div>
            ))}
            {qOptions.length < 6 && (
              <button type="button" className="secondary" onClick={addOption} style={{ marginBottom: 12 }}>
                + Add option
              </button>
            )}

            <button type="submit" disabled={qSaving}>{qSaving ? "Adding…" : "Add Question"}</button>
          </form>

          {customList.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
                Your custom questions for {subject} ({customList.length})
              </p>
              {customList.map((q) => (
                <div className="content-item" key={q.id}>
                  <div>
                    <span className="badge">{q.chapter}</span>
                    <p style={{ margin: "4px 0 0" }}>{q.question}</p>
                    <p style={{ color: "#64748b", margin: "2px 0 0", fontSize: 13 }}>
                      Correct: {q.correct_answer}
                    </p>
                  </div>
                  <button className="danger" onClick={() => deleteCustomQuestion(q.id)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <h2>Your Exams</h2>
        <div className="card">
          {exams.length === 0 && <p style={{ color: "#64748b" }}>No exams yet.</p>}
          {exams.map((exam) => (
            <div className="content-item" key={exam.id}>
              <div>
                <strong>{exam.title}</strong>
                <span className="badge">{exam.subject}</span>
                <span className="badge" style={exam.is_active ? { background: "#f0fdf4", color: "#15803d" } : {}}>
                  {exam.is_active ? "Open" : "Closed"}
                </span>
                <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 13 }}>
                  {exam.question_count} questions · {exam.duration_minutes} min
                  {stats[exam.id] && ` · avg ${stats[exam.id].avg}% (${stats[exam.id].count} attempt${stats[exam.id].count > 1 ? "s" : ""})`}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="secondary" onClick={() => router.push(`/instructor/exams/${exam.id}`)}>
                  Manage
                </button>
                <button className="secondary" onClick={() => toggleActive(exam)}>
                  {exam.is_active ? "Close" : "Open"}
                </button>
                <button className="secondary" onClick={() => duplicateExam(exam)}>
                  Duplicate
                </button>
                <button className="danger" onClick={() => deleteExam(exam.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

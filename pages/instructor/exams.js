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

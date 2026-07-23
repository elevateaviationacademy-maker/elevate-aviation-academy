import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";

export default function ExamResults() {
  const router = useRouter();
  const { attempt: attemptId } = router.query;
  const [role, setRole] = useState("student");
  const [attempt, setAttempt] = useState(null);
  const [exam, setExam] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (attemptId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", sessionData.session.user.id).single();
    setRole(profile?.role || "student");

    const { data: attemptRow, error: attemptErr } = await supabase
      .from("exam_attempts")
      .select("*")
      .eq("id", attemptId)
      .single();
    if (attemptErr || !attemptRow) return setError("Result not found.");
    if (attemptRow.status !== "submitted") return setError("This exam hasn't been submitted yet.");
    setAttempt(attemptRow);

    const { data: examRow } = await supabase.from("exams").select("*").eq("id", attemptRow.exam_id).single();
    setExam(examRow);
  }

  if (error) {
    return (
      <div>
        <Navbar role={role} />
        <div className="container"><p className="error">{error}</p></div>
      </div>
    );
  }
  if (!attempt || !exam) {
    return (
      <div>
        <Navbar role={role} />
        <div className="container">Loading results…</div>
      </div>
    );
  }

  const chapterStats = {};
  const questions = attempt.questions || [];
  const answers = attempt.answers || {};
  questions.forEach((q) => {
    chapterStats[q.chapter] = chapterStats[q.chapter] || { correct: 0, total: 0 };
    chapterStats[q.chapter].total++;
    if (answers[q.id] === q.correct_answer) chapterStats[q.chapter].correct++;
  });

  const unanswered = questions.filter((q) => !answers[q.id]).length;
  const incorrect = questions.length - attempt.correct_count - unanswered;
  const passColor = attempt.score >= 70 ? "var(--success)" : attempt.score >= 50 ? "#b45309" : "var(--danger)";

  return (
    <div>
      <Navbar role={role} />
      <div className="container">
        <h2>Results — {exam.title}</h2>

        <div className="screen-only">
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: passColor }}>{attempt.score}%</div>
            <p style={{ color: "#64748b", marginTop: 4 }}>
              {attempt.correct_count} correct · {incorrect} incorrect · {unanswered} unanswered out of {questions.length}
            </p>
            {attempt.tab_switches > 0 && (
              <p style={{ color: "#b45309", fontSize: 13 }}>
                ⚠ Tab/app switched {attempt.tab_switches} time{attempt.tab_switches > 1 ? "s" : ""} during this attempt.
              </p>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Chapter breakdown</h3>
            {Object.entries(chapterStats).map(([chapter, s]) => (
              <div className="content-item" key={chapter}>
                <span>{chapter}</span>
                <span className="badge">{s.correct}/{s.total}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/exam")}>Back to exams</button>
          <button className="secondary" onClick={() => router.push("/student/dashboard")}>
            Dashboard
          </button>
          <button className="secondary" onClick={() => window.print()}>
            ⬇ Download PDF
          </button>
          {attempt.score >= 70 && (
            <button className="secondary" onClick={() => router.push(`/exam/certificate?attempt=${attempt.id}`)}>
              🏆 Get certificate
            </button>
          )}
        </div>

        <div className="screen-only">
          <h3>Answer review</h3>
          {questions.map((q, i) => {
            const chosen = answers[q.id];
            return (
              <div className="card" key={q.id}>
                <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
                  Q{i + 1} · {q.chapter}
                </p>
                <p style={{ fontWeight: 600 }}>{q.question}</p>
                {q.options.map((opt) => {
                  let cls = "option-row";
                  if (opt === q.correct_answer) cls += " correct";
                  else if (opt === chosen) cls += " incorrect";
                  return (
                    <div className={cls} key={opt}>
                      {opt}
                      {opt === q.correct_answer && " ✓"}
                      {opt === chosen && opt !== q.correct_answer && " ✗ (your answer)"}
                    </div>
                  );
                })}
                {!chosen && <p style={{ color: "#64748b", fontSize: 13 }}>You did not answer this question.</p>}
              </div>
            );
          })}
        </div>

        {/* Print-only "practice paper" — plain questions, no answers revealed, so it
            can be printed/downloaded and re-attempted like a real DGCA paper. The
            answer key is listed separately at the very end. */}
        <div className="print-only">
          <h2>{exam.title} — Practice Paper</h2>
          <p style={{ color: "#64748b", fontSize: 13 }}>{questions.length} questions</p>
          {questions.map((q, i) => (
            <div className="card" key={q.id}>
              <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
                Q{i + 1} · {q.chapter}
              </p>
              <p style={{ fontWeight: 600 }}>{q.question}</p>
              {q.options.map((opt) => (
                <div className="option-row" key={opt}>
                  {opt}
                </div>
              ))}
            </div>
          ))}

          <h3 style={{ marginTop: 24, pageBreakBefore: "always" }}>Answer key</h3>
          <div className="card">
            {questions.map((q, i) => (
              <div className="content-item" key={q.id}>
                <span>Q{i + 1}</span>
                <span className="badge">{q.correct_answer}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

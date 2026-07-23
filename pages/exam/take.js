import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

export default function ExamTake() {
  const router = useRouter();
  const { examId } = router.query;
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittedRef = useRef(false);
  const tabSwitchesRef = useRef(0);
  const tokenRef = useRef(null);

  useEffect(() => {
    if (examId) loadAttempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  async function loadAttempt() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    tokenRef.current = data.session.access_token;

    try {
      const res = await fetch("/api/exam/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}` },
        body: JSON.stringify({ examId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not start exam");
      if (json.status === "submitted") {
        return router.replace(`/exam/results?attempt=${json.attemptId}`);
      }
      setExam(json);
      setAnswers(json.answers || {});
      const elapsed = Math.floor((Date.now() - new Date(json.startedAt).getTime()) / 1000);
      setTimeLeft(Math.max(0, json.duration - elapsed));
    } catch (err) {
      setError(err.message);
    }
  }

  // Tab-switch / visibility tracking (basic anti-cheat signal, logged with the attempt)
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) tabSwitchesRef.current += 1;
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!exam) return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, exam]);

  function selectAnswer(qid, option) {
    setAnswers((prev) => ({ ...prev, [qid]: option }));
  }

  async function handleSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}` },
        body: JSON.stringify({ attemptId: exam.attemptId, answers, tabSwitches: tabSwitchesRef.current }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not submit exam");
      router.replace(`/exam/results?attempt=${exam.attemptId}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
      submittedRef.current = false;
    }
  }

  if (error) return <div className="container"><p className="error">{error}</p></div>;
  if (!exam) return <div className="container"><p className="loading-row"><span className="spinner dark" />Loading exam…</p></div>;

  const q = exam.questions[current];
  const answeredCount = Object.keys(answers).length;
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const low = timeLeft <= 60;

  return (
    <div className="container" style={{ paddingTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <strong>{exam.title}</strong>
          <div style={{ color: "#64748b", fontSize: 13 }}>{exam.subject}</div>
        </div>
        <span className={"timer-pill" + (low ? " low" : "")}>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
      </div>

      <div className="exam-progress">
        <div
          className="exam-progress-bar"
          style={{ width: `${(answeredCount / exam.questions.length) * 100}%` }}
        />
      </div>

      <div className="card">
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
          Question {current + 1} of {exam.questions.length} · {q.chapter}
        </p>
        <p style={{ fontSize: 17, fontWeight: 600 }}>{q.question}</p>
        {q.options.map((opt) => (
          <div
            key={opt}
            className={"option-row" + (answers[q.id] === opt ? " selected" : "")}
            onClick={() => selectAnswer(q.id, opt)}
          >
            {opt}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="secondary" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
          ← Previous
        </button>
        <button
          disabled={current === exam.questions.length - 1}
          onClick={() => setCurrent((c) => c + 1)}
        >
          Next →
        </button>
        <button className="danger" style={{ marginLeft: "auto" }} onClick={handleSubmit} disabled={submitting}>
          {submitting ? (<><span className="spinner" />Submitting…</>) : "Submit"}
        </button>
      </div>

      <div className="card">
        <p style={{ marginTop: 0, fontSize: 13, color: "#64748b" }}>Jump to question</p>
        <div className="qnav-grid">
          {exam.questions.map((qq, i) => (
            <button
              key={qq.id}
              className={
                "qnav-btn" +
                (answers[qq.id] ? " answered" : "") +
                (i === current ? " current" : "")
              }
              onClick={() => setCurrent(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

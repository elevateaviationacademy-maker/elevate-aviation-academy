import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";

export default function ExamList() {
  const router = useRouter();
  const [role, setRole] = useState("student");
  const [exams, setExams] = useState([]);
  const [attempts, setAttempts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    guardAndLoad();
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role === "instructor") return router.replace("/instructor/exams");
    setRole("student");

    const { data: examRows, error: examErr } = await supabase
      .from("exams")
      .select("*")
      .order("created_at", { ascending: false });
    if (examErr) setError(examErr.message);
    setExams(examRows || []);

    const { data: attemptRows } = await supabase
      .from("exam_attempts")
      .select("exam_id, status, score, id")
      .eq("student_id", data.session.user.id);
    const map = {};
    (attemptRows || []).forEach((a) => (map[a.exam_id] = a));
    setAttempts(map);
    setLoading(false);
  }

  function actionFor(exam) {
    const attempt = attempts[exam.id];
    if (attempt?.status === "submitted") {
      return { label: `View result (${attempt.score}%)`, onClick: () => router.push(`/exam/results?attempt=${attempt.id}`) };
    }
    if (attempt?.status === "in_progress") {
      return { label: "Resume exam", onClick: () => router.push(`/exam/take?examId=${exam.id}`) };
    }
    return { label: "Start exam", onClick: () => router.push(`/exam/take?examId=${exam.id}`) };
  }

  return (
    <div>
      <Navbar role={role} />
      <div className="container">
        <h2>Available Exams</h2>
        {error && <p className="error">{error}</p>}
        <div className="card">
          {loading && <p style={{ color: "#64748b" }}>Loading…</p>}
          {!loading && exams.length === 0 && (
            <p style={{ color: "#64748b" }}>
              No exams yet. Your instructor needs to create an exam and grant you access.
            </p>
          )}
          {exams.map((exam) => {
            const action = actionFor(exam);
            return (
              <div className="content-item" key={exam.id}>
                <div>
                  <strong>{exam.title}</strong>
                  <span className="badge">{exam.subject}</span>
                  <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 13 }}>
                    {exam.question_count} questions · {exam.duration_minutes} min
                  </p>
                </div>
                <button onClick={action.onClick}>{action.label}</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

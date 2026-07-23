import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import Navbar from "../../../components/Navbar";

export default function ManageExam() {
  const router = useRouter();
  const { id } = router.query;
  const [exam, setExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [grants, setGrants] = useState([]);
  const [attempts, setAttempts] = useState({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (id) guardAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role !== "instructor") return router.replace("/student/dashboard");

    const { data: examRow } = await supabase.from("exams").select("*").eq("id", id).single();
    setExam(examRow);

    const { data: studentRows } = await supabase.from("profiles").select("*").eq("role", "student").order("full_name");
    setStudents(studentRows || []);

    loadGrants();
    loadAttempts();
  }

  async function loadGrants() {
    const { data } = await supabase.from("exam_access").select("student_id").eq("exam_id", id);
    setGrants((data || []).map((g) => g.student_id));
  }

  async function loadAttempts() {
    const { data } = await supabase.from("exam_attempts").select("*").eq("exam_id", id);
    const map = {};
    (data || []).forEach((a) => (map[a.student_id] = a));
    setAttempts(map);
  }

  async function toggleAccess(studentId, hasAccess) {
    setMessage("");
    if (hasAccess) {
      const { error } = await supabase.from("exam_access").delete().eq("exam_id", id).eq("student_id", studentId);
      if (error) return setMessage("Error: " + error.message);
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      const { error } = await supabase
        .from("exam_access")
        .insert({ exam_id: id, student_id: studentId, granted_by: sessionData.session.user.id });
      if (error) return setMessage("Error: " + error.message);
    }
    loadGrants();
  }

  async function grantAll() {
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const rows = students
      .filter((s) => !grants.includes(s.id))
      .map((s) => ({ exam_id: id, student_id: s.id, granted_by: sessionData.session.user.id }));
    if (!rows.length) return;
    const { error } = await supabase.from("exam_access").insert(rows);
    if (error) return setMessage("Error: " + error.message);
    loadGrants();
  }

  async function revokeAll() {
    if (!confirm("Revoke access for every student on this exam?")) return;
    setMessage("");
    const { error } = await supabase.from("exam_access").delete().eq("exam_id", id);
    if (error) return setMessage("Error: " + error.message);
    loadGrants();
  }

  async function toggleActive() {
    await supabase.from("exams").update({ is_active: !exam.is_active }).eq("id", id);
    const { data: examRow } = await supabase.from("exams").select("*").eq("id", id).single();
    setExam(examRow);
  }

  if (!exam) {
    return (
      <div>
        <Navbar role="instructor" />
        <div className="container">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <Navbar role="instructor" />
      <div className="container">
        <button className="secondary" onClick={() => router.push("/instructor/exams")}>← Back to exams</button>

        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>{exam.title}</h2>
          <p style={{ color: "#64748b" }}>
            {exam.subject} · {exam.question_count} questions · {exam.duration_minutes} min
          </p>
          <button onClick={toggleActive}>{exam.is_active ? "Close gate" : "Open gate"}</button>
          <span className="badge" style={exam.is_active ? { background: "#f0fdf4", color: "#15803d" } : {}}>
            {exam.is_active ? "Open — students with access can take it now" : "Closed — hidden from students"}
          </span>
        </div>

        <h3>Grant Access & Monitor</h3>
        <div className="card">
          {message && <p className="error">{message}</p>}
          {students.length === 0 && <p style={{ color: "#64748b" }}>No students have signed up yet.</p>}
          {students.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="secondary" onClick={grantAll}>Grant all</button>
              <button className="secondary" onClick={revokeAll}>Revoke all</button>
            </div>
          )}
          {students.map((s) => {
            const hasAccess = grants.includes(s.id);
            const attempt = attempts[s.id];
            return (
              <div className="content-item" key={s.id}>
                <div>
                  {s.full_name || s.email}
                  <span className="badge">{s.email}</span>
                  {attempt && (
                    <span className="badge" style={attempt.status === "submitted" ? { background: "#f0fdf4", color: "#15803d" } : {}}>
                      {attempt.status === "submitted" ? `Scored ${attempt.score}%` : "In progress"}
                    </span>
                  )}
                </div>
                <button className={hasAccess ? "secondary" : ""} onClick={() => toggleAccess(s.id, hasAccess)}>
                  {hasAccess ? "Revoke" : "Grant"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

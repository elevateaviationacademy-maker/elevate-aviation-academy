import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";
import { SUBJECTS } from "../../lib/subjects";

function dateKey(iso) {
  if (!iso) return "Unknown date";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function timeOnly(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function InstructorResults() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState([]);

  useEffect(() => {
    guardAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role !== "instructor") return router.replace("/student/dashboard");
    loadResults();
  }

  async function loadResults() {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("exam_attempts")
      .select(
        "id, score, correct_count, total, tab_switches, ended_at, started_at, exams(title, subject), profiles(full_name, email)"
      )
      .eq("status", "submitted")
      .order("ended_at", { ascending: false });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setAttempts(data || []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div>
        <Navbar role="instructor" />
        <div className="container">
          <p className="loading-row"><span className="spinner dark" />Loading results…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Navbar role="instructor" />
        <div className="container"><p className="error">{error}</p></div>
      </div>
    );
  }

  // Group: subject -> date label -> [attempts], each already sorted newest-first
  const bySubject = {};
  attempts.forEach((a) => {
    const subject = a.exams?.subject || "Unsorted";
    const dkey = dateKey(a.ended_at || a.started_at);
    bySubject[subject] = bySubject[subject] || {};
    bySubject[subject][dkey] = bySubject[subject][dkey] || [];
    bySubject[subject][dkey].push(a);
  });

  // Subject order: known subjects first (in their defined order), then anything else found
  const subjectOrder = [...SUBJECTS, ...Object.keys(bySubject).filter((s) => !SUBJECTS.includes(s))].filter(
    (s) => bySubject[s]
  );

  return (
    <div>
      <Navbar role="instructor" />
      <div className="container">
        <h2>Results</h2>

        {attempts.length === 0 && (
          <div className="card">
            <p style={{ color: "#64748b", margin: 0 }}>No submitted exam attempts yet.</p>
          </div>
        )}

        {subjectOrder.map((subject) => {
          const dateGroups = bySubject[subject];
          const subjectAttempts = Object.values(dateGroups).flat();
          const subjectAvg = Math.round(
            subjectAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / subjectAttempts.length
          );
          const dateOrder = Object.keys(dateGroups).sort(
            (a, b) => new Date(dateGroups[b][0].ended_at) - new Date(dateGroups[a][0].ended_at)
          );

          return (
            <details key={subject} className="card" style={{ marginBottom: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 16 }}>
                {subject}
                <span className="badge">
                  {subjectAttempts.length} attempt{subjectAttempts.length > 1 ? "s" : ""} · avg {subjectAvg}%
                </span>
              </summary>

              <div style={{ marginTop: 12 }}>
                {dateOrder.map((label) => {
                  const dayAttempts = dateGroups[label];
                  return (
                    <details key={label} style={{ marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid #e2e8f0" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155" }}>
                        {label}
                        <span className="badge">{dayAttempts.length}</span>
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        {dayAttempts.map((a) => (
                          <div className="content-item" key={a.id}>
                            <div>
                              <strong>{a.profiles?.full_name || a.profiles?.email || "Unknown student"}</strong>
                              <span className="badge">{a.exams?.title}</span>
                              <span
                                className="badge"
                                style={a.score >= 70 ? { background: "#f0fdf4", color: "#15803d" } : {}}
                              >
                                {a.score}%
                              </span>
                              <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 13 }}>
                                {a.correct_count}/{a.total} correct · submitted {timeOnly(a.ended_at)}
                                {a.tab_switches > 0 && ` · ⚠ ${a.tab_switches} tab switch${a.tab_switches > 1 ? "es" : ""}`}
                              </p>
                            </div>
                            <button
                              className="secondary"
                              onClick={() => router.push(`/exam/results?attempt=${a.id}`)}
                            >
                              View
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

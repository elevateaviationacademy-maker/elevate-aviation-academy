import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";
import { SUBJECTS } from "../../lib/subjects";

export default function InstructorComments() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comments, setComments] = useState([]);

  useEffect(() => {
    guardAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role !== "instructor") return router.replace("/student/dashboard");
    loadComments();
  }

  async function loadComments() {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("content_comments")
      .select("id, comment, created_at, content(id, title, subject), profiles(full_name, email)")
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setComments(data || []);
    setLoading(false);
  }

  async function deleteComment(id) {
    if (!confirm("Delete this comment?")) return;
    await supabase.from("content_comments").delete().eq("id", id);
    loadComments();
  }

  if (loading) {
    return (
      <div>
        <Navbar role="instructor" />
        <div className="container"><p className="loading-row"><span className="spinner dark" />Loading comments…</p></div>
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

  // Group: subject -> content item -> [comments]
  const bySubject = {};
  comments.forEach((c) => {
    const subject = c.content?.subject || "Unsorted";
    const itemKey = c.content?.id || "unknown";
    const itemTitle = c.content?.title || "(deleted item)";
    bySubject[subject] = bySubject[subject] || {};
    bySubject[subject][itemKey] = bySubject[subject][itemKey] || { title: itemTitle, comments: [] };
    bySubject[subject][itemKey].comments.push(c);
  });

  const subjectOrder = [...SUBJECTS, ...Object.keys(bySubject).filter((s) => !SUBJECTS.includes(s))].filter(
    (s) => bySubject[s]
  );

  return (
    <div>
      <Navbar role="instructor" />
      <div className="container">
        <h2>Comments</h2>
        {comments.length === 0 && (
          <div className="card"><p style={{ color: "#64748b", margin: 0 }}>No student comments yet.</p></div>
        )}

        {subjectOrder.map((subject) => {
          const items = bySubject[subject];
          const totalCount = Object.values(items).reduce((sum, i) => sum + i.comments.length, 0);
          return (
            <details key={subject} className="card" style={{ marginBottom: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 16 }}>
                {subject}
                <span className="badge">{totalCount} comment{totalCount > 1 ? "s" : ""}</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                {Object.entries(items).map(([contentId, item]) => (
                  <details key={contentId} style={{ marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid #e2e8f0" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155" }}>
                      {item.title}
                      <span className="badge">{item.comments.length}</span>
                    </summary>
                    <div style={{ marginTop: 8 }}>
                      {item.comments.map((c) => (
                        <div className="content-item" key={c.id}>
                          <div>
                            <strong>{c.profiles?.full_name || c.profiles?.email || "Student"}</strong>
                            <p style={{ margin: "4px 0 0" }}>{c.comment}</p>
                            <p style={{ color: "#64748b", margin: "2px 0 0", fontSize: 12 }}>
                              {new Date(c.created_at).toLocaleString()}
                            </p>
                          </div>
                          <button className="danger" onClick={() => deleteComment(c.id)}>Delete</button>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

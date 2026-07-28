import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";
import ProtectedVideo from "../../components/ProtectedVideo";
import ProtectedPdf from "../../components/ProtectedPdf";
import ProtectedYouTube, { extractYoutubeId } from "../../components/ProtectedYouTube";

export default function ContentViewer() {
  const router = useRouter();
  const { id } = router.query;
  const [viewData, setViewData] = useState(null);
  const [error, setError] = useState("");
  const [role, setRole] = useState("student");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return router.replace("/login");

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", sessionData.session.user.id).single();
    setRole(profile?.role || "student");

    const res = await fetch("/api/get-view-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}` },
      body: JSON.stringify({ contentId: id }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error || "Could not load content");
    setViewData(json);
    loadComments();
  }

  async function loadComments() {
    // Students only ever get their own rows back (RLS); instructors get everyone's.
    const { data } = await supabase
      .from("content_comments")
      .select("*, profiles(full_name, email)")
      .eq("content_id", id)
      .order("created_at", { ascending: false });
    setComments(data || []);
  }

  async function postComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error: err } = await supabase.from("content_comments").insert({
      content_id: id,
      student_id: sessionData.session.user.id,
      comment: newComment.trim(),
    });
    setPosting(false);
    if (!err) {
      setNewComment("");
      loadComments();
    }
  }

  async function deleteComment(commentId) {
    if (role !== "instructor" && !confirm("Delete this comment?")) return;
    await supabase.from("content_comments").delete().eq("id", commentId);
    loadComments();
  }

  return (
    <div>
      <Navbar role={role} />
      <div className="container">
        <button className="secondary" onClick={() => router.back()}>← Back</button>
        {error && <p className="error">{error}</p>}
        {viewData && (
          <div className="card" style={{ marginTop: 16 }}>
            <h2>{viewData.title}</h2>
            {viewData.type === "video" ? (
              <ProtectedVideo signedUrl={viewData.viewUrl} watermarkText={viewData.watermark} />
            ) : viewData.type === "youtube" ? (
              <ProtectedYouTube videoId={extractYoutubeId(viewData.youtubeUrl)} watermarkText={viewData.watermark} />
            ) : (
              <ProtectedPdf signedUrl={viewData.viewUrl} watermarkText={viewData.watermark} />
            )}
          </div>
        )}

        {viewData && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              {role === "instructor" ? "Student comments on this item" : "Have a doubt about this?"}
            </h3>
            {role === "student" && (
              <form onSubmit={postComment}>
                <textarea
                  placeholder="e.g. Didn't follow the part about lapse rate at 5:30…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  style={{ minHeight: 60 }}
                />
                <button type="submit" disabled={posting}>{posting ? "Posting…" : "Post comment"}</button>
              </form>
            )}
            <div style={{ marginTop: 12 }}>
              {comments.length === 0 && (
                <p style={{ color: "#64748b", fontSize: 13 }}>
                  {role === "instructor" ? "No comments on this item yet." : "You haven't left a comment on this yet."}
                </p>
              )}
              {comments.map((c) => (
                <div className="content-item" key={c.id}>
                  <div>
                    {role === "instructor" && (
                      <strong>{c.profiles?.full_name || c.profiles?.email || "Student"} </strong>
                    )}
                    <p style={{ margin: "4px 0 0" }}>{c.comment}</p>
                    <p style={{ color: "#64748b", margin: "2px 0 0", fontSize: 12 }}>
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button className="danger" onClick={() => deleteComment(c.id)}>Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

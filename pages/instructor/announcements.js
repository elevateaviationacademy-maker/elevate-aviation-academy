import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";

export default function InstructorAnnouncements() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    guardAndLoad();
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role !== "instructor") return router.replace("/student/dashboard");
    load();
  }

  async function load() {
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    setItems(data || []);
  }

  async function post(e) {
    e.preventDefault();
    setPosting(true);
    setMessage("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { error } = await supabase.from("announcements").insert({
        title,
        body,
        created_by: sessionData.session.user.id,
      });
      if (error) throw error;
      setTitle("");
      setBody("");
      load();
    } catch (err) {
      setMessage("Error: " + err.message);
    }
    setPosting(false);
  }

  async function remove(id) {
    if (!confirm("Delete this announcement?")) return;
    await supabase.from("announcements").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <Navbar role="instructor" />
      <div className="container">
        <h2>Post Announcement</h2>
        <div className="card">
          {message && <p className="error">{message}</p>}
          <form onSubmit={post}>
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <textarea placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={3} required />
            <p style={{ color: "#64748b", fontSize: 13, marginTop: -8 }}>
              Visible to every student on their dashboard — not targeted per exam/content.
            </p>
            <button type="submit" disabled={posting}>{posting ? "Posting…" : "Post"}</button>
          </form>
        </div>

        <h2>Posted</h2>
        <div className="card">
          {items.length === 0 && <p style={{ color: "#64748b" }}>No announcements yet.</p>}
          {items.map((a) => (
            <div className="content-item" key={a.id}>
              <div>
                <strong>{a.title}</strong>
                <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 13 }}>{a.body}</p>
              </div>
              <button className="danger" onClick={() => remove(a.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

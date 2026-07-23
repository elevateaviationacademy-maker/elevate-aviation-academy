import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";
import { extractYoutubeId } from "../../components/ProtectedYouTube";
import { SUBJECTS } from "../../lib/subjects";

export default function InstructorDashboard() {
  const router = useRouter();
  const [content, setContent] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [type, setType] = useState("video");
  const [file, setFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    guardAndLoad();
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role !== "instructor") return router.replace("/student/dashboard");
    loadContent();
  }

  async function loadContent() {
    const { data } = await supabase.from("content").select("*").order("created_at", { ascending: false });
    setContent(data || []);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setFile(null);
    setYoutubeUrl("");
    setSubject(SUBJECTS[0]);
  }

  async function handleUpload(e) {
    e.preventDefault();
    setUploading(true);
    setMessage("");
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (type === "youtube") {
        const videoId = extractYoutubeId(youtubeUrl);
        if (!videoId) throw new Error("That doesn't look like a valid YouTube URL or video ID.");

        const { error: insertErr } = await supabase.from("content").insert({
          title,
          description,
          subject,
          type: "youtube",
          youtube_url: videoId,
          created_by: userData.user.id,
        });
        if (insertErr) throw insertErr;
      } else {
        if (!file) throw new Error("Choose a file to upload.");
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session.access_token;

        const urlRes = await fetch("/api/get-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ filename: file.name, contentType: file.type }),
        });
        const { uploadUrl, key, error: urlErr } = await urlRes.json();
        if (urlErr) throw new Error(urlErr);

        let putRes;
        try {
          putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        } catch (networkErr) {
          throw new Error(
            "Upload to storage failed (network error). This is almost always a missing CORS policy on the R2 bucket — see the README's Cloudflare setup step."
          );
        }
        if (!putRes.ok) {
          throw new Error(`Upload to storage failed (HTTP ${putRes.status}). Check the R2 bucket's CORS policy allows PUT from this origin.`);
        }

        const { error: insertErr } = await supabase.from("content").insert({
          title,
          description,
          subject,
          type,
          file_key: key,
          created_by: userData.user.id,
        });
        if (insertErr) throw insertErr;
      }

      setMessage("Added successfully.");
      resetForm();
      loadContent();
    } catch (err) {
      setMessage("Error: " + err.message);
    }
    setUploading(false);
  }

  async function handleReassignSubject(id, newSubject) {
    await supabase.from("content").update({ subject: newSubject }).eq("id", id);
    loadContent();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this content? This cannot be undone.")) return;
    await supabase.from("content").delete().eq("id", id);
    loadContent();
  }

  return (
    <div>
      <Navbar role="instructor" />
      <div className="container">
        <div className="dashboard-banner">
          <img src="/images/dashboard-instructor.jpg" alt="" className="dashboard-banner-img" />
          <div className="dashboard-banner-overlay" />
          <div className="dashboard-banner-content">
            <h2>Instructor dashboard</h2>
            <p>Manage course content, exams, access, and results — all in one place.</p>
          </div>
        </div>

        <h2>Add Content</h2>
        <div className="card">
          {message && <p className={message.startsWith("Error") ? "error" : "success"}>{message}</p>}
          <form onSubmit={handleUpload}>
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            <label style={{ fontSize: 13, color: "#64748b" }}>Subject</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <label style={{ fontSize: 13, color: "#64748b" }}>Type</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setFile(null); setYoutubeUrl(""); }}>
              <option value="video">Video (upload to storage)</option>
              <option value="youtube">YouTube (unlisted link)</option>
              <option value="pdf">PDF</option>
            </select>

            {type === "youtube" ? (
              <>
                <input
                  placeholder="Unlisted YouTube URL (e.g. https://youtu.be/xxxxxxxxxxx)"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  required
                />
                <p style={{ color: "#64748b", fontSize: 13, marginTop: -8 }}>
                  Upload the video to YouTube as <strong>Unlisted</strong>, then paste the link here.
                  No storage/bandwidth cost, and YouTube handles transcoding and adaptive streaming.
                </p>
              </>
            ) : (
              <input
                type="file"
                accept={type === "video" ? "video/*" : "application/pdf"}
                onChange={(e) => setFile(e.target.files[0])}
                required
              />
            )}

            <button type="submit" disabled={uploading}>{uploading ? "Saving…" : "Add Content"}</button>
          </form>
        </div>

        <h2>Your Content</h2>
        {content.length === 0 && <div className="card"><p style={{ color: "#64748b" }}>No content yet.</p></div>}
        {SUBJECTS.filter((s) => content.some((c) => c.subject === s)).map((s) => {
          const items = content.filter((c) => c.subject === s);
          const videos = items.filter((c) => c.type === "video" || c.type === "youtube");
          const pdfs = items.filter((c) => c.type === "pdf");
          return (
            <div className="card" key={s}>
              <h3 style={{ marginTop: 0 }}>{s}</h3>

              <p style={{ color: "#64748b", fontSize: 13, marginBottom: 4 }}>Videos</p>
              {videos.length === 0 && <p style={{ color: "#334155", fontSize: 13 }}>None yet</p>}
              {videos.map((c) => (
                <div className="content-item" key={c.id}>
                  <div><strong>{c.title}</strong><span className="badge">{c.type}</span></div>
                  <button className="secondary" onClick={() => handleDelete(c.id)}>Delete</button>
                </div>
              ))}

              <p style={{ color: "#64748b", fontSize: 13, margin: "12px 0 4px" }}>PDFs</p>
              {pdfs.length === 0 && <p style={{ color: "#334155", fontSize: 13 }}>None yet</p>}
              {pdfs.map((c) => (
                <div className="content-item" key={c.id}>
                  <div><strong>{c.title}</strong><span className="badge">{c.type}</span></div>
                  <button className="secondary" onClick={() => handleDelete(c.id)}>Delete</button>
                </div>
              ))}
            </div>
          );
        })}
        {/* content saved under a subject outside the standard list (e.g. old "Unsorted" rows) */}
        {content.some((c) => !SUBJECTS.includes(c.subject)) && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Unsorted</h3>
            {content.filter((c) => !SUBJECTS.includes(c.subject)).map((c) => (
              <div className="content-item" key={c.id}>
                <div><strong>{c.title}</strong><span className="badge">{c.type}</span></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select defaultValue="" onChange={(e) => e.target.value && handleReassignSubject(c.id, e.target.value)}>
                    <option value="" disabled>Move to subject…</option>
                    {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="secondary" onClick={() => handleDelete(c.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

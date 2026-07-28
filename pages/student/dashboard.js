import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";
import { SUBJECTS } from "../../lib/subjects";

export default function StudentDashboard() {
  const router = useRouter();
  const [content, setContent] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [fullName, setFullName] = useState("");
  const [todayItem, setTodayItem] = useState(null);
  const [nextItem, setNextItem] = useState(null);

  useEffect(() => {
    guardAndLoad();
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", data.session.user.id).single();
    if (profile?.role === "instructor") return router.replace("/instructor/dashboard");
    setFullName(profile?.full_name || "");

    // RLS ensures this only returns content this student has been granted.
    const { data: rows } = await supabase.from("content").select("*").order("created_at", { ascending: false });
    setContent(rows || []);

    const { data: ann } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);
    setAnnouncements(ann || []);

    loadSchedule();
  }

  async function loadSchedule() {
    const todayStr = new Date().toISOString().slice(0, 10);
    // Pull today plus a couple weeks ahead so we can find "today" and the
    // next non-holiday day even across a run of consecutive holidays.
    const { data } = await supabase
      .from("schedule_items")
      .select("*")
      .gte("date", todayStr)
      .order("date")
      .limit(21);
    if (!data || !data.length) return;
    const today = data.find((d) => d.date === todayStr) || null;
    setTodayItem(today);
    const next = data.find((d) => d.date > todayStr && !d.is_holiday) || null;
    setNextItem(next);
  }

  return (
    <div>
      <Navbar role="student" />
      <div className="container">
        <div className="dashboard-banner">
          <img src="/images/dashboard-student.jpg" alt="" className="dashboard-banner-img" />
          <div className="dashboard-banner-overlay" />
          <div className="dashboard-banner-content">
            <h2>{fullName ? `Welcome back, ${fullName.split(" ")[0]}` : "Welcome back"}</h2>
            <p>Keep working through your courses and practice exams — every session gets you closer to exam day.</p>
          </div>
        </div>

        {(todayItem || nextItem) && (
          <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Today</p>
              {todayItem?.is_holiday ? (
                <strong style={{ color: "#92400e" }}>Holiday — no class today</strong>
              ) : todayItem ? (
                <strong>{todayItem.topic}</strong>
              ) : (
                <span style={{ color: "#94a3b8" }}>Nothing scheduled</span>
              )}
            </div>
            {nextItem && (
              <div>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
                  Next class — {new Date(nextItem.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </p>
                <strong>{nextItem.topic}</strong>
              </div>
            )}
          </div>
        )}

        {announcements.length > 0 && (
          <>
            <h2>Announcements</h2>
            <div className="card">
              {announcements.map((a) => (
                <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <strong>{a.title}</strong>
                  <p style={{ color: "#64748b", margin: "4px 0 0" }}>{a.body}</p>
                  <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                    {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        <h2>My Courses</h2>
        {content.length === 0 && (
          <div className="card">
            <p style={{ color: "#64748b" }}>
              Nothing here yet. Your instructor needs to grant you access to a video or PDF.
            </p>
          </div>
        )}
        {SUBJECTS.concat(["Unsorted"])
          .filter((s) => content.some((c) => c.subject === s))
          .map((s) => {
            const items = content.filter((c) => c.subject === s);
            const videos = items.filter((c) => c.type === "video" || c.type === "youtube");
            const pdfs = items.filter((c) => c.type === "pdf");
            return (
              <div className="card" key={s}>
                <h3 style={{ marginTop: 0 }}>{s}</h3>

                {videos.length > 0 && <p style={{ color: "#64748b", fontSize: 13, marginBottom: 4 }}>Videos</p>}
                {videos.map((c) => (
                  <div className="content-item" key={c.id}>
                    <div>
                      <strong>{c.title}</strong>
                      <span className="badge">{c.type}</span>
                      {c.description && <p style={{ color: "#64748b", margin: "4px 0 0" }}>{c.description}</p>}
                    </div>
                    <button onClick={() => router.push(`/content/${c.id}`)}>Open</button>
                  </div>
                ))}

                {pdfs.length > 0 && <p style={{ color: "#64748b", fontSize: 13, margin: "12px 0 4px" }}>PDFs</p>}
                {pdfs.map((c) => (
                  <div className="content-item" key={c.id}>
                    <div>
                      <strong>{c.title}</strong>
                      <span className="badge">{c.type}</span>
                      {c.description && <p style={{ color: "#64748b", margin: "4px 0 0" }}>{c.description}</p>}
                    </div>
                    <button onClick={() => router.push(`/content/${c.id}`)}>Open</button>
                  </div>
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}

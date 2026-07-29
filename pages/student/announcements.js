import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";

export default function StudentAnnouncements() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    guardAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role === "instructor") return router.replace("/instructor/dashboard");
    load();
  }

  async function load() {
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    setAnnouncements(data || []);
    setLoading(false);
  }

  return (
    <div>
      <Navbar role="student" />
      <div className="container">
        <h2>Announcements</h2>
        {loading && <p className="loading-row"><span className="spinner dark" />Loading…</p>}
        {!loading && announcements.length === 0 && (
          <div className="card"><p style={{ color: "#64748b", margin: 0 }}>No announcements yet.</p></div>
        )}
        {!loading && announcements.length > 0 && (
          <div className="card">
            {announcements.map((a) => (
              <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <strong>{a.title}</strong>
                <p style={{ color: "#64748b", margin: "4px 0 0" }}>{a.body}</p>
                <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                  {new Date(a.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

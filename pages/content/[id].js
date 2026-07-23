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
      </div>
    </div>
  );
}

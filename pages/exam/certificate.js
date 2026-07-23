import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

const PASS_MARK = 70;

export default function Certificate() {
  const router = useRouter();
  const { attempt: attemptId } = router.query;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (attemptId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return router.replace("/login");

    const { data: attempt } = await supabase.from("exam_attempts").select("*").eq("id", attemptId).single();
    if (!attempt || attempt.status !== "submitted") return setError("Certificate not available for this attempt.");
    if (attempt.score < PASS_MARK) return setError(`A score of ${PASS_MARK}%+ is required for a certificate.`);

    const { data: exam } = await supabase.from("exams").select("*").eq("id", attempt.exam_id).single();
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", attempt.student_id).single();

    setData({ attempt, exam, profile });
  }

  if (error) return <div className="container"><p className="error">{error}</p></div>;
  if (!data) return <div className="container"><p className="loading-row"><span className="spinner dark" />Loading…</p></div>;

  const { attempt, exam, profile } = data;
  const dateStr = new Date(attempt.ended_at).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        <button className="secondary" onClick={() => router.back()}>← Back</button>
      </div>

      <div className="certificate">
        <div className="certificate-inner">
          <p className="certificate-eyebrow">ELEVATE AVIATION ACADEMY</p>
          <div className="seal">🎖️</div>
          <h1 className="certificate-title">Certificate of Achievement</h1>
          <p className="certificate-body">This certifies that</p>
          <p className="certificate-name">{profile?.full_name || profile?.email}</p>
          <p className="certificate-body">
            has successfully passed the practice examination in
          </p>
          <p className="certificate-subject">{exam?.subject}</p>
          <p className="certificate-body">
            with a score of <strong>{attempt.score}%</strong>
          </p>
          <p className="certificate-date">{dateStr}</p>
        </div>
      </div>

      <style jsx global>{`
        .certificate {
          max-width: 800px;
          margin: 16px auto 32px;
          padding: 56px 40px;
          border: 8px double #1e2937;
          border-radius: 4px;
          background: #fff;
          color: #1e2937;
          text-align: center;
          font-family: Georgia, "Times New Roman", serif;
        }
        .certificate-inner { max-width: 480px; margin: 0 auto; }
        .certificate-eyebrow {
          letter-spacing: 2px;
          font-size: 12px;
          font-weight: 700;
          color: var(--brand);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          margin-bottom: 4px;
        }
        .seal { font-size: 3rem; margin: 8px 0; }
        .certificate-title { font-size: 2.2rem; margin: 0 0 24px; }
        .certificate-body { color: #475569; margin: 8px 0; font-size: 15px; }
        .certificate-name { font-size: 26px; font-weight: 700; margin: 4px 0 16px; }
        .certificate-subject { font-size: 19px; font-weight: 700; margin: 4px 0 16px; color: var(--brand-dark); }
        .certificate-date {
          color: #94a3b8;
          font-size: 13px;
          margin-top: 28px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        @media print {
          .navbar, .no-print { display: none !important; }
          body { background: #fff; }
          .container { max-width: 100%; padding: 0; }
          .certificate { border: 8px double #1e2937; margin: 0; box-shadow: none; }
        }
      `}</style>
    </div>
  );
}

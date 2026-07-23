import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase reads the recovery token out of the URL fragment and turns it
    // into a real (temporary) session automatically — we just need to wait
    // for that to land before letting the user submit a new password.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords don't match.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    setDone(true);
  }

  return (
    <div className="auth-split">
      <div className="auth-hero">
        <img src="/images/hero-cockpit.jpg" alt="" className="auth-hero-img" />
        <div className="auth-hero-overlay" />
        <div className="auth-hero-content">
          <img src="/logo.png" alt="Elevate Aviation Academy" className="auth-hero-logo" />
          <p>DGCA CPL / ATPL ground school — course content and practice exams in one place.</p>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="card auth-card">
          <img src="/logo-mark.png" alt="" className="auth-card-mark" />
          <h2 style={{ marginBottom: 4 }}>Set a new password</h2>
          {error && <p className="error">{error}</p>}
          {done ? (
            <>
              <p className="success">Password updated. You can log in now.</p>
              <button onClick={() => router.push("/login")} style={{ width: "100%" }}>
                Go to login
              </button>
            </>
          ) : !ready ? (
            <p style={{ color: "#64748b" }}>Verifying your reset link…</p>
          ) : (
            <form onSubmit={handleSubmit}>
              <input
                type="password"
                placeholder="New password (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
              />
              <button type="submit" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

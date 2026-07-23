import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
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
          <h2 style={{ marginBottom: 4 }}>Reset your password</h2>
          <p style={{ color: "#64748b", marginTop: 0 }}>
            Enter your account email and we'll send you a reset link.
          </p>
          {error && <p className="error">{error}</p>}
          {done ? (
            <>
              <p className="success">
                If an account exists for {email}, a reset link is on its way. Check your inbox (and spam folder).
              </p>
              <p style={{ textAlign: "center" }}>
                <a href="/login">Back to login</a>
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
              <p style={{ marginTop: 12, textAlign: "center" }}>
                <a href="/login">Back to login</a>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

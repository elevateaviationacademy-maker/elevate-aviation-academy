import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Signup() {
  const [fullName, setFullName] = useState("");
  const [batch, setBatch] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, batch: batch.trim() } },
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
          <h2 style={{ marginBottom: 4 }}>Create your account</h2>
          {error && <p className="error">{error}</p>}
          {done ? (
            <>
              <p className="success">Account created. Check your email to confirm, then log in.</p>
              <button onClick={() => router.push("/login")} style={{ width: "100%" }}>
                Go to login
              </button>
            </>
          ) : (
            <form onSubmit={handleSignup}>
              <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              <input
                placeholder="Batch code (ask your instructor)"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
              />
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input type="password" placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              <button type="submit" disabled={loading} style={{ width: "100%" }}>
                {loading ? "Creating account…" : "Sign up"}
              </button>
            </form>
          )}
          <p style={{ marginTop: 12, textAlign: "center" }}>
            Already have an account? <a href="/login">Log in</a>
          </p>
          {!done && (
            <p style={{ marginTop: 8, color: "#64748b", fontSize: 13 }}>
              New accounts are students by default. You won't see any course content
              until your instructor grants you access.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

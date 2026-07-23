import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      return setError(error.message);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    router.push(profile?.role === "instructor" ? "/instructor/dashboard" : "/student/dashboard");
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
          <h2 style={{ marginBottom: 4 }}>Welcome back</h2>
          <p style={{ color: "#64748b", marginTop: 0 }}>Sign in to your portal</p>
          {error && <p className="error">{error}</p>}
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Signing in…" : "Log in"}
            </button>
          </form>
          <p style={{ marginTop: 12, textAlign: "center" }}>
            New student? <a href="/signup">Create an account</a>
          </p>
        </div>
      </div>
    </div>
  );
}

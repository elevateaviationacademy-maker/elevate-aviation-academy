import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Navbar({ role }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="navbar">
      <a href={role === "instructor" ? "/instructor/dashboard" : "/student/dashboard"} className="navbar-brand">
        <img src="/logo.png" alt="Elevate Aviation Academy" className="navbar-logo" />
      </a>

      <button
        className="navbar-toggle"
        aria-label="Toggle menu"
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        {menuOpen ? "✕" : "☰"}
      </button>

      <div className={`navbar-links${menuOpen ? " open" : ""}`} onClick={() => setMenuOpen(false)}>
        {role === "instructor" && (
          <>
            <a href="/instructor/dashboard">Content</a>
            <a href="/instructor/access">Access</a>
            <a href="/instructor/exams">Exams</a>
            <a href="/instructor/schedule">Schedule</a>
            <a href="/instructor/results">Results</a>
            <a href="/instructor/comments">Comments</a>
            <a href="/instructor/announcements">Announcements</a>
          </>
        )}
        {role === "student" && (
          <>
            <a href="/student/dashboard">My Courses</a>
            <a href="/exam">Practice Exams</a>
            <a href="/student/announcements">Announcements</a>
          </>
        )}
        <a href="#" onClick={logout}>Log out</a>
      </div>
    </div>
  );
}

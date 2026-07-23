import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Navbar({ role }) {
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="navbar">
      <strong>Elevate Aviation Academy</strong>
      <div>
        {role === "instructor" && (
          <>
            <a href="/instructor/dashboard">Content</a>
            <a href="/instructor/access">Access</a>
            <a href="/instructor/exams">Exams</a>
            <a href="/instructor/results">Results</a>
            <a href="/instructor/announcements">Announcements</a>
          </>
        )}
        {role === "student" && (
          <>
            <a href="/student/dashboard">My Courses</a>
            <a href="/exam">Practice Exams</a>
          </>
        )}
        <a href="#" onClick={logout}>Log out</a>
      </div>
    </div>
  );
}

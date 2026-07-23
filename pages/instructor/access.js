import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";
import { SUBJECTS } from "../../lib/subjects";

export default function AccessControl() {
  const router = useRouter();
  const [content, setContent] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedContent, setSelectedContent] = useState("");
  const [grants, setGrants] = useState([]);
  const [message, setMessage] = useState("");

  // Bulk (subject-wide) grant state
  const [bulkSubject, setBulkSubject] = useState(SUBJECTS[0]);
  const [bulkStudent, setBulkStudent] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");

  useEffect(() => {
    guardAndLoad();
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role !== "instructor") return router.replace("/student/dashboard");

    const { data: contentRows } = await supabase.from("content").select("*").order("subject").order("title");
    setContent(contentRows || []);
    if (contentRows?.length) setSelectedContent(contentRows[0].id);

    const { data: studentRows } = await supabase.from("profiles").select("*").eq("role", "student").order("full_name");
    setStudents(studentRows || []);
    if (studentRows?.length) setBulkStudent(studentRows[0].id);
  }

  useEffect(() => {
    if (selectedContent) loadGrants();
  }, [selectedContent]);

  async function loadGrants() {
    const { data } = await supabase.from("access_grants").select("student_id").eq("content_id", selectedContent);
    setGrants((data || []).map((g) => g.student_id));
  }

  async function toggleAccess(studentId, hasAccess) {
    setMessage("");
    if (hasAccess) {
      const { error } = await supabase
        .from("access_grants")
        .delete()
        .eq("content_id", selectedContent)
        .eq("student_id", studentId);
      if (error) return setMessage("Error: " + error.message);
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      const { error } = await supabase.from("access_grants").insert({
        content_id: selectedContent,
        student_id: studentId,
        granted_by: sessionData.session.user.id,
      });
      if (error) return setMessage("Error: " + error.message);
    }
    loadGrants();
  }

  async function bulkGrantSubject(revoke) {
    setBulkBusy(true);
    setBulkMessage("");
    try {
      const subjectContentIds = content.filter((c) => c.subject === bulkSubject).map((c) => c.id);
      if (subjectContentIds.length === 0) {
        setBulkMessage("No content exists under this subject yet.");
        setBulkBusy(false);
        return;
      }
      if (revoke) {
        const { error } = await supabase
          .from("access_grants")
          .delete()
          .eq("student_id", bulkStudent)
          .in("content_id", subjectContentIds);
        if (error) throw error;
        setBulkMessage(`Revoked all "${bulkSubject}" content for this student.`);
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        const rows = subjectContentIds.map((content_id) => ({
          content_id,
          student_id: bulkStudent,
          granted_by: sessionData.session.user.id,
        }));
        // upsert so re-running this doesn't fail on items already granted
        const { error } = await supabase.from("access_grants").upsert(rows, { onConflict: "content_id,student_id" });
        if (error) throw error;
        setBulkMessage(`Granted all "${bulkSubject}" content (${subjectContentIds.length} items) to this student.`);
      }
      if (selectedContent) loadGrants();
    } catch (err) {
      setBulkMessage("Error: " + err.message);
    }
    setBulkBusy(false);
  }

  async function deleteStudent(student) {
    const ok = window.confirm(
      `Permanently delete ${student.full_name || student.email}'s account?\n\nThis removes their login, all access grants, and all exam attempts. This cannot be undone.`
    );
    if (!ok) return;
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/delete-student", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({ studentId: student.id }),
    });
    const body = await res.json();
    if (!res.ok) return setMessage("Error: " + body.error);
    setStudents((prev) => prev.filter((s) => s.id !== student.id));
    setGrants((prev) => prev.filter((id) => id !== student.id));
  }

  // Group content by subject for the dropdown, so it's easy to find the right item.
  const groupedContent = SUBJECTS.concat(["Unsorted"]).map((s) => ({
    subject: s,
    items: content.filter((c) => (c.subject || "Unsorted") === s),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <Navbar role="instructor" />
      <div className="container">
        <h2>Grant Access — Whole Subject</h2>
        <div className="card">
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
            Gives (or removes) one student access to every video and PDF currently under a subject, in one click.
            New content added to that subject later still needs to be granted separately (or run this again).
          </p>
          <label style={{ fontSize: 13, color: "#64748b" }}>Subject</label>
          <select value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)}>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label style={{ fontSize: 13, color: "#64748b" }}>Student</label>
          <select value={bulkStudent} onChange={(e) => setBulkStudent(e.target.value)}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </select>
          {bulkMessage && <p className={bulkMessage.startsWith("Error") ? "error" : "success"}>{bulkMessage}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={bulkBusy || !bulkStudent} onClick={() => bulkGrantSubject(false)}>
              {bulkBusy ? "Working…" : `Grant all "${bulkSubject}"`}
            </button>
            <button className="secondary" disabled={bulkBusy || !bulkStudent} onClick={() => bulkGrantSubject(true)}>
              Revoke all "{bulkSubject}"
            </button>
          </div>
        </div>

        <h2>Grant Access — Individual Item</h2>
        <div className="card">
          <label style={{ fontSize: 13, color: "#64748b" }}>Content</label>
          <select value={selectedContent} onChange={(e) => setSelectedContent(e.target.value)}>
            {groupedContent.map((g) => (
              <optgroup key={g.subject} label={g.subject}>
                {g.items.map((c) => (
                  <option key={c.id} value={c.id}>{c.title} ({c.type})</option>
                ))}
              </optgroup>
            ))}
          </select>
          {message && <p className="error">{message}</p>}
          {students.length === 0 && <p style={{ color: "#64748b" }}>No students have signed up yet.</p>}
          {students.map((s) => {
            const hasAccess = grants.includes(s.id);
            return (
              <div className="content-item" key={s.id}>
                <div>{s.full_name || s.email}<span className="badge">{s.email}</span></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className={hasAccess ? "secondary" : ""} onClick={() => toggleAccess(s.id, hasAccess)}>
                    {hasAccess ? "Revoke" : "Grant"}
                  </button>
                  <button className="danger" onClick={() => deleteStudent(s)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";
import { SUBJECTS } from "../../lib/subjects";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Parses lines like "2026-08-03: The Solar System" or "2026-08-08: HOLIDAY".
// Returns { rows, errors } — errors list any lines that couldn't be read,
// with their line number, so the instructor can fix and re-paste.
function parseBulkText(text) {
  const rows = [];
  const errors = [];
  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const idx = trimmed.indexOf(":");
    if (idx === -1) return errors.push(`Line ${i + 1}: no ":" found — expected "YYYY-MM-DD: Topic"`);
    const datePart = trimmed.slice(0, idx).trim();
    const rest = trimmed.slice(idx + 1).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return errors.push(`Line ${i + 1}: "${datePart}" isn't a YYYY-MM-DD date`);
    }
    const isHoliday = rest.toUpperCase() === "HOLIDAY";
    if (!isHoliday && !rest) return errors.push(`Line ${i + 1}: no topic text after the date`);
    rows.push({ date: datePart, topic: isHoliday ? null : rest, is_holiday: isHoliday });
  });
  return { rows, errors };
}

export default function InstructorSchedule() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [bulkSubject, setBulkSubject] = useState(SUBJECTS[0]);
  const [bulkText, setBulkText] = useState("");
  const [bulkErrors, setBulkErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Add/edit single day
  const [editDate, setEditDate] = useState(todayStr());
  const [editSubject, setEditSubject] = useState(SUBJECTS[0]);
  const [editTopic, setEditTopic] = useState("");
  const [editHoliday, setEditHoliday] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    guardAndLoad();
  }, []);

  async function guardAndLoad() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return router.replace("/login");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).single();
    if (profile?.role !== "instructor") return router.replace("/student/dashboard");
    load();
  }

  async function load() {
    const { data } = await supabase.from("schedule_items").select("*").order("date");
    setItems(data || []);
  }

  async function postAnnouncement(title, body) {
    const { data: sessionData } = await supabase.auth.getSession();
    await supabase.from("announcements").insert({ title, body, created_by: sessionData.session.user.id });
  }

  async function submitBulk(e) {
    e.preventDefault();
    setMessage("");
    const { rows, errors } = parseBulkText(bulkText);
    setBulkErrors(errors);
    if (!rows.length) {
      if (!errors.length) setMessage("Nothing to save — paste some lines first.");
      return;
    }
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const withMeta = rows.map((r) => ({
      ...r,
      subject: bulkSubject,
      created_by: sessionData.session.user.id,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("schedule_items").upsert(withMeta, { onConflict: "date,subject" });
    setSaving(false);
    if (error) return setMessage("Error: " + error.message);

    const dates = rows.map((r) => r.date).sort();
    setMessage(`Saved ${rows.length} day(s) for ${bulkSubject}${errors.length ? ` — ${errors.length} line(s) skipped, see below` : ""}.`);
    await postAnnouncement(
      "Schedule updated",
      `The ${bulkSubject} schedule was updated for ${dates[0]}${dates.length > 1 ? ` through ${dates[dates.length - 1]}` : ""} (${rows.length} day${rows.length > 1 ? "s" : ""}).`
    );
    setBulkText("");
    load();
  }

  async function saveSingleDay(e) {
    e.preventDefault();
    if (!editDate) return;
    setEditSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.from("schedule_items").upsert(
      {
        date: editDate,
        subject: editSubject,
        topic: editHoliday ? null : editTopic.trim() || null,
        is_holiday: editHoliday,
        created_by: sessionData.session.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date,subject" }
    );
    setEditSaving(false);
    if (error) return setMessage("Error: " + error.message);
    await postAnnouncement(
      "Schedule updated",
      editHoliday
        ? `${editDate} is now marked as a holiday for ${editSubject}.`
        : `${editDate} (${editSubject}) updated — topic: ${editTopic.trim()}.`
    );
    setEditTopic("");
    setEditHoliday(false);
    load();
  }

  function editRow(item) {
    setEditDate(item.date);
    setEditSubject(item.subject);
    setEditTopic(item.topic || "");
    setEditHoliday(item.is_holiday);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteDay(date, subject) {
    if (!confirm(`Remove ${date} (${subject}) from the schedule entirely?`)) return;
    await supabase.from("schedule_items").delete().eq("date", date).eq("subject", subject);
    load();
  }

  // Group: subject -> month -> [items]
  const bySubject = {};
  items.forEach((item) => {
    const subject = item.subject || "Unsorted";
    const monthKey = item.date.slice(0, 7);
    bySubject[subject] = bySubject[subject] || {};
    bySubject[subject][monthKey] = bySubject[subject][monthKey] || [];
    bySubject[subject][monthKey].push(item);
  });
  const subjectOrder = [...SUBJECTS, ...Object.keys(bySubject).filter((s) => !SUBJECTS.includes(s))].filter(
    (s) => bySubject[s]
  );

  return (
    <div>
      <Navbar role="instructor" />
      <div className="container">
        <h2>Schedule</h2>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add / edit a single day</h3>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
            For quick one-off adjustments — reschedule a topic, or flip a day to a holiday and back.
          </p>
          {message && <p className={message.startsWith("Error") ? "error" : "success"}>{message}</p>}
          <form onSubmit={saveSingleDay}>
            <label style={{ fontSize: 13, color: "#64748b" }}>Date</label>
            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} required />

            <label style={{ fontSize: 13, color: "#64748b" }}>Subject</label>
            <select value={editSubject} onChange={(e) => setEditSubject(e.target.value)}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={editHoliday}
                onChange={(e) => setEditHoliday(e.target.checked)}
              />
              <span>Mark as holiday</span>
            </label>

            {!editHoliday && (
              <>
                <label style={{ fontSize: 13, color: "#64748b" }}>Topic</label>
                <input
                  placeholder="e.g. Convergency"
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                />
              </>
            )}

            <button type="submit" disabled={editSaving}>{editSaving ? "Saving…" : "Save this day"}</button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bulk paste a schedule</h3>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
            One line per day: <code>YYYY-MM-DD: Topic</code>, or <code>YYYY-MM-DD: HOLIDAY</code> for a day off.
            Re-pasting a date you already used overwrites that day rather than duplicating it.
          </p>
          <form onSubmit={submitBulk}>
            <label style={{ fontSize: 13, color: "#64748b" }}>Subject — applies to every line below</label>
            <select value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <textarea
              placeholder={"2026-08-03: The Solar System\n2026-08-04: The Earth\n2026-08-08: HOLIDAY"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              style={{ minHeight: 160, fontFamily: "monospace", fontSize: 13 }}
            />
            <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save schedule"}</button>
          </form>
          {bulkErrors.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="error" style={{ marginBottom: 4 }}>Some lines were skipped:</p>
              {bulkErrors.map((e, i) => (
                <p key={i} style={{ color: "#b91c1c", fontSize: 13, margin: "2px 0" }}>{e}</p>
              ))}
            </div>
          )}
        </div>

        <h2>Your Schedule</h2>
        {items.length === 0 && (
          <div className="card"><p style={{ color: "#64748b", margin: 0 }}>No schedule days added yet.</p></div>
        )}
        {subjectOrder.map((subject) => {
          const months = bySubject[subject];
          const monthOrder = Object.keys(months).sort();
          const totalDays = Object.values(months).reduce((sum, m) => sum + m.length, 0);
          return (
            <details key={subject} className="card" style={{ marginBottom: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 16 }}>
                {subject}
                <span className="badge">{totalDays} days</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                {monthOrder.map((month) => (
                  <details key={month} style={{ marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid #e2e8f0" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155" }}>
                      {new Date(month + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                      <span className="badge">{months[month].length}</span>
                    </summary>
                    <div style={{ marginTop: 8 }}>
                      {months[month].map((item) => (
                        <div className="content-item" key={item.date + item.subject}>
                          <div>
                            <strong>{new Date(item.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</strong>
                            {item.is_holiday ? (
                              <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>Holiday</span>
                            ) : (
                              <span className="badge">{item.topic}</span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="secondary" onClick={() => editRow(item)}>Edit</button>
                            <button className="danger" onClick={() => deleteDay(item.date, item.subject)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

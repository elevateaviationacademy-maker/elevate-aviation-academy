import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import Navbar from "../../components/Navbar";
import { SUBJECTS } from "../../lib/subjects";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Takes one topic per line (plus optional "HOLIDAY" lines) and a start date,
// and assigns each non-blank line the next sequential calendar date — no
// need to type out YYYY-MM-DD on every line. Blank lines are skipped
// entirely (they don't consume a date slot).
function parseSequentialLines(text, startDateStr) {
  const rows = [];
  if (!startDateStr) return { rows, error: "Pick a start date first." };
  const start = new Date(startDateStr + "T00:00:00");
  if (isNaN(start.getTime())) return { rows, error: "Start date isn't valid." };

  let offset = 0;
  text.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    offset++;
    const isHoliday = trimmed.toUpperCase() === "HOLIDAY";
    rows.push({ date: d.toISOString().slice(0, 10), topic: isHoliday ? null : trimmed, is_holiday: isHoliday });
  });
  return { rows, error: null };
}

export default function InstructorSchedule() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [bulkSubject, setBulkSubject] = useState(SUBJECTS[0]);
  const [bulkStartDate, setBulkStartDate] = useState(todayStr());
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState("");
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
    const { rows, error: parseErr } = parseSequentialLines(bulkText, bulkStartDate);
    setBulkError(parseErr || "");
    if (parseErr) return;
    if (!rows.length) {
      setMessage("Nothing to save — paste some lines first.");
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
    setMessage(`Saved ${rows.length} day(s) for ${bulkSubject}, starting ${dates[0]}.`);
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
    // Deliberately no announcement here — quick single-day tweaks (mostly
    // holiday adjustments) would otherwise flood the feed. Only the bulk
    // schedule save above posts an update.
    setMessage("Saved.");
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
            Pick the date the first line starts on, then paste one topic per line, in order. Each line takes the
            next calendar day automatically — no need to type dates. Write <code>HOLIDAY</code> on a line for a day
            off (matches your usual "Saturday - Exam / Sunday - Holiday" pattern — just put the actual topic instead
            of "Exam" if it's not a holiday). Re-running this with an overlapping start date overwrites those days
            rather than duplicating them.
          </p>
          {bulkError && <p className="error">{bulkError}</p>}
          <form onSubmit={submitBulk}>
            <label style={{ fontSize: 13, color: "#64748b" }}>Subject — applies to every line below</label>
            <select value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <label style={{ fontSize: 13, color: "#64748b" }}>Start date — the first line below lands on this day</label>
            <input type="date" value={bulkStartDate} onChange={(e) => setBulkStartDate(e.target.value)} required />

            <label style={{ fontSize: 13, color: "#64748b" }}>Topics, one per line, in order</label>
            <textarea
              placeholder={"The Solar System\nThe Earth\nProjections\nConvergency\nTime\nExam\nHOLIDAY"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              style={{ minHeight: 160, fontFamily: "monospace", fontSize: 13 }}
            />
            <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save schedule"}</button>
          </form>
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

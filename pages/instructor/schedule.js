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
  const [tracks, setTracks] = useState([{ subject: SUBJECTS[0], startDate: todayStr(), text: "" }]);
  const [bulkError, setBulkError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(new Set()); // keys of "date|subject"

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

  function updateTrack(idx, patch) {
    setTracks((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function addTrack() {
    setTracks((prev) => [...prev, { subject: SUBJECTS[0], startDate: todayStr(), text: "" }]);
  }

  function removeTrack(idx) {
    setTracks((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitBulk(e) {
    e.preventDefault();
    setMessage("");
    setBulkError("");

    let allRows = [];
    const subjectsTouched = [];
    for (const track of tracks) {
      if (!track.text.trim()) continue; // skip empty tracks silently
      const { rows, error: parseErr } = parseSequentialLines(track.text, track.startDate);
      if (parseErr) return setBulkError(`${track.subject}: ${parseErr}`);
      if (rows.length) {
        allRows = allRows.concat(rows.map((r) => ({ ...r, subject: track.subject })));
        subjectsTouched.push(track.subject);
      }
    }
    if (!allRows.length) {
      setMessage("Nothing to save — paste some lines into at least one subject first.");
      return;
    }

    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const withMeta = allRows.map((r) => ({
      ...r,
      created_by: sessionData.session.user.id,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("schedule_items").upsert(withMeta, { onConflict: "date,subject" });
    setSaving(false);
    if (error) return setMessage("Error: " + error.message);

    setMessage(`Saved ${allRows.length} day(s) across ${subjectsTouched.length} subject(s): ${subjectsTouched.join(", ")}.`);
    await postAnnouncement(
      "Schedule updated",
      `The schedule was updated for ${subjectsTouched.join(", ")} (${allRows.length} day${allRows.length > 1 ? "s" : ""} total).`
    );
    setTracks([{ subject: SUBJECTS[0], startDate: todayStr(), text: "" }]);
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

  function keyOf(item) {
    return `${item.date}|${item.subject}`;
  }

  function toggleSelected(item) {
    const key = keyOf(item);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll(groupItems) {
    const keys = groupItems.map(keyOf);
    const allSelected = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`Permanently delete ${selected.size} selected day(s)?`)) return;
    const toDelete = items.filter((item) => selected.has(keyOf(item)));
    setSaving(true);
    for (const item of toDelete) {
      await supabase.from("schedule_items").delete().eq("date", item.date).eq("subject", item.subject);
    }
    setSaving(false);
    setSelected(new Set());
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
            next calendar day automatically. Write <code>HOLIDAY</code> on a line for a day off. Add another
            subject block below to schedule several subjects in one save — e.g. Air Navigation and Meteorology
            running in parallel. Re-running this with an overlapping start date overwrites those days rather than
            duplicating them.
          </p>
          {bulkError && <p className="error">{bulkError}</p>}
          <form onSubmit={submitBulk}>
            {tracks.map((track, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                  position: "relative",
                }}
              >
                {tracks.length > 1 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => removeTrack(idx)}
                    style={{ position: "absolute", top: 12, right: 12 }}
                  >
                    ✕ Remove
                  </button>
                )}
                <label style={{ fontSize: 13, color: "#64748b" }}>Subject</label>
                <select value={track.subject} onChange={(e) => updateTrack(idx, { subject: e.target.value })}>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>

                <label style={{ fontSize: 13, color: "#64748b" }}>Start date — the first line below lands on this day</label>
                <input
                  type="date"
                  value={track.startDate}
                  onChange={(e) => updateTrack(idx, { startDate: e.target.value })}
                  required
                />

                <label style={{ fontSize: 13, color: "#64748b" }}>Topics, one per line, in order</label>
                <textarea
                  placeholder={"The Solar System\nThe Earth\nProjections\nConvergency\nTime\nExam\nHOLIDAY"}
                  value={track.text}
                  onChange={(e) => updateTrack(idx, { text: e.target.value })}
                  style={{ minHeight: 140, fontFamily: "monospace", fontSize: 13 }}
                />
              </div>
            ))}
            <button type="button" className="secondary" onClick={addTrack} style={{ marginBottom: 12 }}>
              + Add another subject
            </button>
            <div>
              <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save schedule"}</button>
            </div>
          </form>
        </div>

        <h2>Your Schedule</h2>
        {items.length === 0 && (
          <div className="card"><p style={{ color: "#64748b", margin: 0 }}>No schedule days added yet.</p></div>
        )}
        {selected.size > 0 && (
          <div
            className="card"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 8, zIndex: 5 }}
          >
            <span>{selected.size} day(s) selected</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary" onClick={() => setSelected(new Set())}>Clear selection</button>
              <button className="danger" disabled={saving} onClick={deleteSelected}>
                {saving ? "Deleting…" : `Delete ${selected.size} selected`}
              </button>
            </div>
          </div>
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
                {monthOrder.map((month) => {
                  const monthItems = months[month];
                  const allChecked = monthItems.every((item) => selected.has(keyOf(item)));
                  return (
                    <details key={month} style={{ marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid #e2e8f0" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600, color: "#334155" }}>
                        {new Date(month + "-01").toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                        <span className="badge">{monthItems.length}</span>
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b", marginBottom: 8 }}>
                          <input type="checkbox" checked={allChecked} onChange={() => toggleSelectAll(monthItems)} />
                          <span>Select all in this month</span>
                        </label>
                        {monthItems.map((item) => (
                          <div className="content-item" key={item.date + item.subject}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <input
                                type="checkbox"
                                checked={selected.has(keyOf(item))}
                                onChange={() => toggleSelected(item)}
                              />
                              <div>
                                <strong>{new Date(item.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</strong>
                                {item.is_holiday ? (
                                  <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>Holiday</span>
                                ) : (
                                  <span className="badge">{item.topic}</span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="secondary" onClick={() => editRow(item)}>Edit</button>
                              <button className="danger" onClick={() => deleteDay(item.date, item.subject)}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

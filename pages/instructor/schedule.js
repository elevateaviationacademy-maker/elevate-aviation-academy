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
// entirely (they don't consume a date slot). A trailing " x2" (or x3, x4…)
// repeats that same topic across that many consecutive days instead of
// requiring the line to be typed out multiple times — e.g. "Convergency x2"
// takes two classes. Works on HOLIDAY lines too ("HOLIDAY x2").
function parseSequentialLines(text, startDateStr) {
  const rows = [];
  if (!startDateStr) return { rows, error: "Pick a start date first." };
  const start = new Date(startDateStr + "T00:00:00");
  if (isNaN(start.getTime())) return { rows, error: "Start date isn't valid." };

  let offset = 0;
  text.split("\n").forEach((line) => {
    let trimmed = line.trim();
    if (!trimmed) return;

    let repeat = 1;
    const repeatMatch = trimmed.match(/\s+x(\d+)$/i);
    if (repeatMatch) {
      repeat = Math.max(1, parseInt(repeatMatch[1], 10));
      trimmed = trimmed.slice(0, repeatMatch.index).trim();
    }

    const isHoliday = trimmed.toUpperCase() === "HOLIDAY";
    for (let r = 0; r < repeat; r++) {
      const d = new Date(start);
      d.setDate(d.getDate() + offset);
      offset++;
      rows.push({ date: d.toISOString().slice(0, 10), topic: isHoliday ? null : trimmed, is_holiday: isHoliday });
    }
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
    let rows = data || [];

    // Auto-cleanup: once every day for a subject is in the past, that
    // subject is "finished" — clear its whole schedule so history doesn't
    // pile up. Only runs the delete for subjects that actually qualify.
    const todayStr = new Date().toISOString().slice(0, 10);
    const lastDateBySubject = {};
    rows.forEach((r) => {
      if (!lastDateBySubject[r.subject] || r.date > lastDateBySubject[r.subject]) {
        lastDateBySubject[r.subject] = r.date;
      }
    });
    const finishedSubjects = Object.entries(lastDateBySubject)
      .filter(([, lastDate]) => lastDate < todayStr)
      .map(([subject]) => subject);

    if (finishedSubjects.length) {
      await supabase.from("schedule_items").delete().in("subject", finishedSubjects);
      rows = rows.filter((r) => !finishedSubjects.includes(r.subject));
      setMessage(`Cleared finished schedule for: ${finishedSubjects.join(", ")}.`);
    }

    setItems(rows);
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

  // Inserts a holiday at editDate and pushes everything after it (for the
  // same subject) forward by one day, so a last-minute holiday doesn't just
  // erase whatever was already scheduled that day. Delete-then-reinsert
  // avoids unique(date,subject) collisions while shifting the whole chain.
  async function insertHolidayAndShift() {
    if (!editDate) return;
    if (
      !confirm(
        `Mark ${editDate} (${editSubject}) as a holiday and shift everything scheduled after it forward by one day?`
      )
    )
      return;
    setEditSaving(true);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session.user.id;

    const { data: chain, error: fetchErr } = await supabase
      .from("schedule_items")
      .select("*")
      .eq("subject", editSubject)
      .gte("date", editDate)
      .order("date");
    if (fetchErr) {
      setEditSaving(false);
      return setMessage("Error: " + fetchErr.message);
    }

    if (chain.length) {
      const { error: delErr } = await supabase
        .from("schedule_items")
        .delete()
        .eq("subject", editSubject)
        .gte("date", editDate);
      if (delErr) {
        setEditSaving(false);
        return setMessage("Error: " + delErr.message);
      }
    }

    const newRows = [
      {
        date: editDate,
        subject: editSubject,
        topic: null,
        is_holiday: true,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
    ];
    chain.forEach((item) => {
      const d = new Date(item.date + "T00:00:00");
      d.setDate(d.getDate() + 1);
      newRows.push({
        date: d.toISOString().slice(0, 10),
        subject: editSubject,
        topic: item.topic,
        is_holiday: item.is_holiday,
        created_by: userId,
        updated_at: new Date().toISOString(),
      });
    });

    const { error: insErr } = await supabase.from("schedule_items").insert(newRows);
    setEditSaving(false);
    if (insErr) return setMessage("Error: " + insErr.message);

    await postAnnouncement(
      "Schedule updated",
      `${editDate} is now a holiday for ${editSubject} — ${chain.length} day(s) after it shifted forward by one day.`
    );
    setMessage(`Inserted holiday on ${editDate} for ${editSubject} and shifted ${chain.length} day(s) forward.`);
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

  function labelFor(item) {
    return item.topic || (item.is_holiday ? "Holiday" : "this day");
  }

  // Gives an already-saved topic one more day: duplicates it into the next
  // date and shifts everything after that (same subject) forward by a day.
  // Same underlying mechanism as the holiday insert, generalized to any item.
  async function extendDay(item) {
    if (
      !confirm(`Give "${labelFor(item)}" (${item.subject}) one more day? Everything after it shifts forward by one day.`)
    )
      return;
    setSaving(true);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session.user.id;

    const nextDate = new Date(item.date + "T00:00:00");
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().slice(0, 10);

    const { data: chain, error: fetchErr } = await supabase
      .from("schedule_items")
      .select("*")
      .eq("subject", item.subject)
      .gte("date", nextDateStr)
      .order("date");
    if (fetchErr) {
      setSaving(false);
      return setMessage("Error: " + fetchErr.message);
    }

    if (chain.length) {
      const { error: delErr } = await supabase
        .from("schedule_items")
        .delete()
        .eq("subject", item.subject)
        .gte("date", nextDateStr);
      if (delErr) {
        setSaving(false);
        return setMessage("Error: " + delErr.message);
      }
    }

    const newRows = [
      {
        date: nextDateStr,
        subject: item.subject,
        topic: item.topic,
        is_holiday: item.is_holiday,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
    ];
    chain.forEach((c) => {
      const d = new Date(c.date + "T00:00:00");
      d.setDate(d.getDate() + 1);
      newRows.push({
        date: d.toISOString().slice(0, 10),
        subject: item.subject,
        topic: c.topic,
        is_holiday: c.is_holiday,
        created_by: userId,
        updated_at: new Date().toISOString(),
      });
    });

    const { error: insErr } = await supabase.from("schedule_items").insert(newRows);
    setSaving(false);
    if (insErr) return setMessage("Error: " + insErr.message);
    await postAnnouncement(
      "Schedule updated",
      `"${labelFor(item)}" (${item.subject}) extended by one more day — ${chain.length} day(s) after it shifted forward.`
    );
    setMessage(`Extended "${labelFor(item)}" by a day; shifted ${chain.length} day(s) forward.`);
    load();
  }

  // Removes this one date and pulls everything after it (same subject) back
  // by one day, closing the gap — the opposite of extendDay.
  async function shortenDay(item) {
    if (
      !confirm(`Remove ${item.date} from "${labelFor(item)}" (${item.subject})? Everything after it shifts back by one day.`)
    )
      return;
    setSaving(true);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session.user.id;

    const { data: chain, error: fetchErr } = await supabase
      .from("schedule_items")
      .select("*")
      .eq("subject", item.subject)
      .gt("date", item.date)
      .order("date");
    if (fetchErr) {
      setSaving(false);
      return setMessage("Error: " + fetchErr.message);
    }

    const { error: delErr } = await supabase
      .from("schedule_items")
      .delete()
      .eq("subject", item.subject)
      .gte("date", item.date);
    if (delErr) {
      setSaving(false);
      return setMessage("Error: " + delErr.message);
    }

    const newRows = chain.map((c) => {
      const d = new Date(c.date + "T00:00:00");
      d.setDate(d.getDate() - 1);
      return {
        date: d.toISOString().slice(0, 10),
        subject: item.subject,
        topic: c.topic,
        is_holiday: c.is_holiday,
        created_by: userId,
        updated_at: new Date().toISOString(),
      };
    });

    if (newRows.length) {
      const { error: insErr } = await supabase.from("schedule_items").insert(newRows);
      if (insErr) {
        setSaving(false);
        return setMessage("Error: " + insErr.message);
      }
    }
    setSaving(false);
    await postAnnouncement(
      "Schedule updated",
      `${item.date} removed from "${labelFor(item)}" (${item.subject}) — ${chain.length} day(s) after it shifted back by one day.`
    );
    setMessage(`Removed ${item.date}; shifted ${chain.length} day(s) back.`);
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
            {editHoliday && (
              <>
                <button
                  type="button"
                  className="secondary"
                  disabled={editSaving}
                  onClick={insertHolidayAndShift}
                  style={{ marginLeft: 8 }}
                >
                  {editSaving ? "Working…" : "Insert holiday & shift everything after forward"}
                </button>
                <p style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
                  "Save this day" just overwrites {editDate || "this date"} with a holiday — anything already
                  scheduled there is lost, nothing else moves. "Insert & shift" keeps that day's topic by pushing
                  it (and everything after it, for {editSubject}) forward by one day instead.
                </p>
              </>
            )}
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bulk paste a schedule</h3>
          <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
            Pick the date the first line starts on, then paste one topic per line, in order. Each line takes the
            next calendar day automatically. Write <code>HOLIDAY</code> on a line for a day off. If a topic needs
            more than one class, add <code>x2</code>, <code>x3</code>, etc. to the end of that line — e.g.{" "}
            <code>Convergency x2</code> takes up two consecutive days instead of one. Add another subject block
            below to schedule several subjects in one save — e.g. Air Navigation and Meteorology running in
            parallel. Re-running this with an overlapping start date overwrites those days rather than duplicating
            them.
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
                  placeholder={"The Solar System\nThe Earth\nProjections\nConvergency x2\nTime\nExam\nHOLIDAY"}
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
        <p style={{ color: "#64748b", fontSize: 13, marginTop: -8 }}>
          A subject's schedule clears itself automatically once every day in it is in the past — no manual cleanup needed.
        </p>
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
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="secondary" disabled={saving} onClick={() => extendDay(item)} title="Give this topic one more day, shifting everything after forward">
                                +1 day
                              </button>
                              <button className="secondary" disabled={saving} onClick={() => shortenDay(item)} title="Remove this day, shifting everything after back">
                                −1 day
                              </button>
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

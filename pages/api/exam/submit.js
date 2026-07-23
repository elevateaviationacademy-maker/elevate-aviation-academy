import supabaseAdmin from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Not authenticated" });
  const userId = userData.user.id;

  const { attemptId, answers, tabSwitches } = req.body || {};
  if (!attemptId) return res.status(400).json({ error: "attemptId is required" });

  const { data: attempt } = await supabaseAdmin
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("student_id", userId)
    .single();
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });
  if (attempt.status === "submitted") return res.status(200).json({ ok: true, alreadySubmitted: true });

  const questions = attempt.questions || [];
  const ans = answers || {};
  let correctCount = 0;
  questions.forEach((q) => {
    if (ans[q.id] === q.correct_answer) correctCount++;
  });
  const score = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;

  const { error: updateErr } = await supabaseAdmin
    .from("exam_attempts")
    .update({
      answers: ans,
      correct_count: correctCount,
      total: questions.length,
      score,
      tab_switches: tabSwitches || 0,
      status: "submitted",
      ended_at: new Date().toISOString(),
    })
    .eq("id", attemptId);
  if (updateErr) return res.status(500).json({ error: updateErr.message });

  res.status(200).json({ ok: true, attemptId, score, correctCount, total: questions.length });
}

import supabaseAdmin from "../../../lib/supabaseAdmin";
import { generatePaper } from "../../../lib/questionBank";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Not authenticated" });
  const userId = userData.user.id;

  const { examId } = req.body || {};
  if (!examId) return res.status(400).json({ error: "examId is required" });

  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).single();
  const isInstructor = profile?.role === "instructor";

  const { data: exam } = await supabaseAdmin.from("exams").select("*").eq("id", examId).single();
  if (!exam) return res.status(404).json({ error: "Exam not found" });
  if (!isInstructor) {
    if (!exam.is_active) return res.status(403).json({ error: "This exam is not currently open" });
    const { data: grant } = await supabaseAdmin
      .from("exam_access")
      .select("id")
      .eq("exam_id", examId)
      .eq("student_id", userId)
      .maybeSingle();
    if (!grant) return res.status(403).json({ error: "You don't have access to this exam" });
  }

  // Resume an existing attempt if one is already in progress or submitted.
  const { data: existing } = await supabaseAdmin
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", examId)
    .eq("student_id", userId)
    .maybeSingle();

  if (existing && existing.status === "submitted") {
    return res.status(200).json({ attemptId: existing.id, status: "submitted" });
  }

  let attempt = existing;
  if (!attempt) {
    let questions;
    try {
      questions = generatePaper(exam.subject, exam.chapters || [], exam.question_count);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!questions.length) return res.status(404).json({ error: "No questions available for this exam" });

    const { data: created, error: insertErr } = await supabaseAdmin
      .from("exam_attempts")
      .insert({
        exam_id: examId,
        student_id: userId,
        questions,
        status: "in_progress",
        started_at: new Date().toISOString(),
        total: questions.length,
      })
      .select()
      .single();
    if (insertErr) return res.status(500).json({ error: insertErr.message });
    attempt = created;
  }

  // Strip correct_answer before sending to the client while the exam is live.
  const safeQuestions = attempt.questions.map(({ correct_answer, ...q }) => q);

  res.status(200).json({
    attemptId: attempt.id,
    title: exam.title,
    subject: exam.subject,
    duration: exam.duration_minutes * 60,
    startedAt: attempt.started_at,
    answers: attempt.answers || {},
    questions: safeQuestions,
  });
}

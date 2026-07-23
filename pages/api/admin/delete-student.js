import supabaseAdmin from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Not authenticated" });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profile?.role !== "instructor") return res.status(403).json({ error: "Instructors only" });

  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ error: "studentId required" });

  // Guard rail: only ever delete accounts that are actually students, never
  // an instructor account, even if the instructor's own id gets passed by mistake.
  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", studentId)
    .single();
  if (!target || target.role !== "student") {
    return res.status(400).json({ error: "That account is not a student, or no longer exists." });
  }

  // Deletes the auth.users row; profiles/access_grants/exam_access/exam_attempts
  // all reference it with "on delete cascade" so they're removed automatically.
  const { error } = await supabaseAdmin.auth.admin.deleteUser(studentId);
  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ ok: true });
}

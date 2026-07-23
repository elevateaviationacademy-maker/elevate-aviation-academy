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

  const { attemptId } = req.body;
  if (!attemptId) return res.status(400).json({ error: "attemptId required" });

  const { error } = await supabaseAdmin.from("exam_attempts").delete().eq("id", attemptId);
  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ ok: true });
}

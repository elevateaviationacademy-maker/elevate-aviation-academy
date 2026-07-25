import supabaseAdmin from "../../../lib/supabaseAdmin";

async function requireInstructor(req, res) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData?.user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "instructor") {
    res.status(403).json({ error: "Instructors only" });
    return null;
  }
  return userData.user;
}

export default async function handler(req, res) {
  const user = await requireInstructor(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin.from("drive_folders").select("*").order("subject");
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ folders: data });
  }

  if (req.method === "POST") {
    // Accepts either a single mapping { subject, folderId, folderName } or
    // a batch { mappings: [{ subject, folderId, folderName }, ...] }.
    const mappings = req.body.mappings || [req.body];
    const rows = mappings
      .filter((m) => m.subject && m.folderId)
      .map((m) => ({
        subject: m.subject,
        folder_id: m.folderId,
        folder_url: m.folderName ? `Drive folder: ${m.folderName}` : null,
        created_by: user.id,
      }));
    if (!rows.length) return res.status(400).json({ error: "No valid mappings provided." });

    const { error } = await supabaseAdmin.from("drive_folders").upsert(rows, { onConflict: "subject" });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, count: rows.length });
  }

  if (req.method === "DELETE") {
    const { subject } = req.body;
    if (!subject) return res.status(400).json({ error: "subject required" });
    const { error } = await supabaseAdmin.from("drive_folders").delete().eq("subject", subject);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}

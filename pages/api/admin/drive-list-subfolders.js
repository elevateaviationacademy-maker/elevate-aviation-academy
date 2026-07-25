import supabaseAdmin from "../../../lib/supabaseAdmin";
import { getDriveClient, extractDriveFolderId, guessSubject } from "../../../lib/googleDrive";
import { SUBJECTS } from "../../../lib/subjects";

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

  const { rootFolderUrl } = req.body;
  const rootId = extractDriveFolderId(rootFolderUrl);
  if (!rootId) return res.status(400).json({ error: "Couldn't find a folder ID in that link." });

  let drive;
  try {
    drive = getDriveClient();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  try {
    const list = await drive.files.list({
      q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      pageSize: 100,
    });
    const folders = (list.data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      guessedSubject: guessSubject(f.name, SUBJECTS),
    }));
    res.status(200).json({ folders });
  } catch (e) {
    res.status(500).json({
      error:
        "Couldn't read that folder. Make sure it's shared with the service account email as a Viewer, and that the link is correct. (" +
        e.message +
        ")",
    });
  }
}

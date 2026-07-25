import { PutObjectCommand } from "@aws-sdk/client-s3";
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { r2, BUCKET } from "../../../lib/r2";
import { getDriveClient, classifyMimeType } from "../../../lib/googleDrive";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Not authenticated" });
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "instructor") return res.status(403).json({ error: "Instructors only" });

  const { subject } = req.body; // optional — sync just one subject, else every mapped folder
  let folderQuery = supabaseAdmin.from("drive_folders").select("*");
  if (subject) folderQuery = folderQuery.eq("subject", subject);
  const { data: folders, error: foldersErr } = await folderQuery;
  if (foldersErr) return res.status(500).json({ error: foldersErr.message });
  if (!folders?.length) return res.status(404).json({ error: "No Drive folder mapped for that subject yet." });

  let drive;
  try {
    drive = getDriveClient();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const results = [];

  for (const folder of folders) {
    let imported = 0;
    let skipped = 0;
    const errors = [];
    try {
      const list = await drive.files.list({
        q: `'${folder.folder_id}' in parents and trashed = false`,
        fields: "files(id, name, mimeType)",
        pageSize: 200,
      });
      const files = list.data.files || [];

      for (const file of files) {
        const { data: already } = await supabaseAdmin
          .from("drive_synced_files")
          .select("drive_file_id")
          .eq("drive_file_id", file.id)
          .maybeSingle();
        if (already) {
          skipped++;
          continue;
        }

        const type = classifyMimeType(file.mimeType);
        if (!type) {
          errors.push(`${file.name}: unsupported file type (${file.mimeType}) — only PDF and video files are synced`);
          continue;
        }

        let fileRes;
        try {
          fileRes = await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "arraybuffer" });
        } catch (e) {
          errors.push(`${file.name}: couldn't download from Drive (${e.message})`);
          continue;
        }
        const buffer = Buffer.from(fileRes.data);

        const key = `drive-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        try {
          await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: file.mimeType }));
        } catch (e) {
          errors.push(`${file.name}: upload to storage failed (${e.message})`);
          continue;
        }

        const { data: contentRow, error: contentErr } = await supabaseAdmin
          .from("content")
          .insert({
            title: file.name.replace(/\.[^.]+$/, ""),
            subject: folder.subject,
            type,
            file_key: key,
            created_by: userData.user.id,
          })
          .select()
          .single();
        if (contentErr) {
          errors.push(`${file.name}: ${contentErr.message}`);
          continue;
        }

        await supabaseAdmin
          .from("drive_synced_files")
          .insert({ drive_file_id: file.id, content_id: contentRow.id, subject: folder.subject });
        imported++;
      }

      await supabaseAdmin
        .from("drive_folders")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", folder.id);
    } catch (e) {
      errors.push(e.message);
    }
    results.push({ subject: folder.subject, imported, skipped, errors });
  }

  res.status(200).json({ results });
}

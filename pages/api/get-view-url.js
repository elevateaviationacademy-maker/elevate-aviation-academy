import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, BUCKET } from "../../lib/r2";
import supabaseAdmin from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Not authenticated" });

  const { contentId } = req.body;
  if (!contentId) return res.status(400).json({ error: "contentId required" });

  const { data: content } = await supabaseAdmin
    .from("content")
    .select("*")
    .eq("id", contentId)
    .single();
  if (!content) return res.status(404).json({ error: "Not found" });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", userData.user.id)
    .single();

  let allowed = profile?.role === "instructor";
  if (!allowed) {
    const { data: grant } = await supabaseAdmin
      .from("access_grants")
      .select("id")
      .eq("content_id", contentId)
      .eq("student_id", userData.user.id)
      .maybeSingle();
    allowed = !!grant;
  }
  if (!allowed) return res.status(403).json({ error: "You don't have access to this content" });

  const response = {
    type: content.type,
    title: content.title,
    watermark: `${profile?.full_name || profile?.email || "student"} — do not distribute`,
  };

  if (content.type === "youtube") {
    response.youtubeUrl = content.youtube_url;
  } else {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: content.file_key });
    const viewUrl = await getSignedUrl(r2, command, { expiresIn: 60 * 20 });
    response.viewUrl = viewUrl;
  }

  res.status(200).json(response);
}

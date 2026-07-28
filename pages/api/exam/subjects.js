import supabaseAdmin from "../../../lib/supabaseAdmin";
import { getSubjectTree } from "../../../lib/questionBank";

export default async function handler(req, res) {
  try {
    const { data: customQuestions } = await supabaseAdmin.from("custom_questions").select("subject, chapter");
    const tree = getSubjectTree(customQuestions || []);
    res.status(200).json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

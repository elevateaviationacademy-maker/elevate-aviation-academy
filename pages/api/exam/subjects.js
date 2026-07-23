import { getSubjectTree } from "../../../lib/questionBank";

export default function handler(req, res) {
  try {
    const tree = getSubjectTree();
    res.status(200).json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

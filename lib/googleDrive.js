import { google } from "googleapis";

function getAuth() {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error(
      "Google Drive isn't connected yet — GOOGLE_DRIVE_CLIENT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY env vars are missing."
    );
  }
  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

export function getDriveClient() {
  return google.drive({ version: "v3", auth: getAuth() });
}

// Accepts a full Drive folder URL (several formats) or a bare folder ID.
export function extractDriveFolderId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const m = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

export function classifyMimeType(mimeType) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType && mimeType.startsWith("video/")) return "video";
  return null; // unsupported: Google Docs/Slides native files, images, etc.
}

// Best-effort match from a Drive subfolder name to one of the app's subjects,
// so common abbreviations (RTR, Tech Speci) pre-fill correctly instead of
// making the instructor map every folder by hand.
const ALIASES = {
  airnavigation: "Air Navigation",
  airregulations: "Air Regulations",
  meteorology: "Meteorology",
  technicalgeneral: "Technical General",
  technicalspecific: "Technical Specific",
  techspeci: "Technical Specific",
  techspecific: "Technical Specific",
  radiotelephony: "Radio Telephony",
  rtr: "Radio Telephony",
  rt: "Radio Telephony",
};

export function guessSubject(folderName, subjects) {
  const key = folderName.toLowerCase().replace(/[^a-z]/g, "");
  if (ALIASES[key] && subjects.includes(ALIASES[key])) return ALIASES[key];
  const found = subjects.find((s) => {
    const sKey = s.toLowerCase().replace(/[^a-z]/g, "");
    return sKey === key || sKey.includes(key) || key.includes(sKey);
  });
  return found || "";
}

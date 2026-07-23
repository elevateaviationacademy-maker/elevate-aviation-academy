// Extracts an 11-char YouTube video ID from a full URL or a bare ID.
export function extractYoutubeId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

// Unlisted videos aren't searchable, but the embed link itself is still a
// shareable URL — same honest-limitations caveat as the video/PDF viewers.
// youtube-nocookie.com is YouTube's privacy-enhanced embed domain and also
// keeps this player off YouTube's own watch-page chrome (related videos,
// channel link-outs, etc.).
//
// startSeconds: resume/jump to a timestamp (?start=123 equivalent).
// autoplay: only pass true if the student explicitly opted in (e.g. clicked
// "Resume video") — browsers block unmuted autoplay without user gesture
// anyway, so this is mostly useful right after such a click.
export default function ProtectedYouTube({ videoId, watermarkText, startSeconds, autoplay }) {
  if (!videoId) return <p className="error">Invalid or missing YouTube video.</p>;

  const params = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
  if (startSeconds) params.set("start", String(Math.floor(startSeconds)));
  if (autoplay) params.set("autoplay", "1");

  return (
    <div className="protected-frame-wrap">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`}
        title="Lesson video"
        style={{ width: "100%", height: "100%", border: "none" }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      <div className="watermark" style={{ pointerEvents: "none" }}>
        {watermarkText}
      </div>
    </div>
  );
}

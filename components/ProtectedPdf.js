import { useEffect } from "react";

export default function ProtectedPdf({ signedUrl, watermarkText }) {
  useEffect(() => {
    const handler = (e) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // #toolbar=0&navpanes=0 hides the browser PDF viewer's own toolbar
  // (which normally has a download button) in Chrome/Edge.
  return (
    <div style={{ position: "relative", width: "100%", height: "80vh" }}>
      <iframe
        src={`${signedUrl}#toolbar=0&navpanes=0`}
        style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="watermark">{watermarkText}</div>
    </div>
  );
}

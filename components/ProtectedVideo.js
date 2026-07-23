import { useEffect, useRef } from "react";

// IMPORTANT HONESTY NOTE (also in README):
// No browser technology can fully stop a screen recording. These measures
// remove the easy/casual paths (right-click save, download button, devtools
// drag-out) and add a visible watermark so any leaked recording is traceable
// back to the student who accessed it. That is the realistic ceiling for a
// free, browser-based system.
export default function ProtectedVideo({ signedUrl, watermarkText }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const handler = (e) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  return (
    <div className="protected-frame-wrap">
      <video
        ref={videoRef}
        src={signedUrl}
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        style={{ width: "100%", height: "100%", background: "#000" }}
      />
      <div className="watermark">{watermarkText}</div>
    </div>
  );
}

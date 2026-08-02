import { useEffect, useState } from "react";

function isStandaloneNow() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = window.navigator.standalone === true; // iOS Safari's own flag
  return !!(mq || iosStandalone);
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export default function InstallGate({ children }) {
  const [standalone, setStandalone] = useState(null); // null = not yet checked (avoids a flash)
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneNow());

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setStandalone(isStandaloneNow());
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Some browsers flip display-mode without firing appinstalled reliably —
    // poll briefly as a fallback so the gate lifts as soon as it actually can.
    const interval = setInterval(() => {
      if (isStandaloneNow()) {
        setStandalone(true);
        clearInterval(interval);
      }
    }, 1500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      clearInterval(interval);
    };
  }, []);

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore — userChoice can reject if the prompt was dismissed abnormally
    }
    setInstalling(false);
    setDeferredPrompt(null);
  }

  if (standalone === null) return null; // avoid a flash of the gate before the check runs
  if (standalone) return children;

  const ios = isIOS();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f6f8fb",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 14, padding: 32, textAlign: "center", boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 1px 6px rgba(15,23,42,0.05)" }}>
        <img src="/logo.png" alt="Elevate Aviation Academy" style={{ height: 40, marginBottom: 20 }} />

        {justInstalled ? (
          <>
            <h2 style={{ marginBottom: 8 }}>Installed!</h2>
            <p style={{ color: "#64748b" }}>
              Open <strong>Elevate</strong> from your home screen or app list to continue — this browser tab won't
              switch over automatically.
            </p>
          </>
        ) : deferredPrompt ? (
          <>
            <h2 style={{ marginBottom: 8 }}>Install the app to continue</h2>
            <p style={{ color: "#64748b", marginBottom: 20 }}>
              Elevate Aviation Academy runs as an app, not a regular website. Install it once — it only takes a
              second — then everything works normally from your home screen.
            </p>
            <button onClick={handleInstallClick} disabled={installing} style={{ width: "100%" }}>
              {installing ? "Installing…" : "Install App"}
            </button>
          </>
        ) : ios ? (
          <>
            <h2 style={{ marginBottom: 8 }}>Install the app to continue</h2>
            <p style={{ color: "#64748b", marginBottom: 16 }}>
              iPhone/iPad needs a couple of manual taps — there's no automatic prompt on iOS:
            </p>
            <ol style={{ textAlign: "left", color: "#334155", paddingLeft: 20, marginBottom: 16 }}>
              <li style={{ marginBottom: 8 }}>Tap the <strong>Share</strong> icon in Safari's toolbar (the square with an arrow)</li>
              <li style={{ marginBottom: 8 }}>Scroll down and tap <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong> in the top right</li>
            </ol>
            <p style={{ color: "#94a3b8", fontSize: 13 }}>
              Must be opened in Safari — Chrome/Instagram/WhatsApp's built-in browser on iPhone can't do this step.
            </p>
          </>
        ) : (
          <>
            <h2 style={{ marginBottom: 8 }}>Install the app to continue</h2>
            <p style={{ color: "#64748b", marginBottom: 12 }}>
              This browser hasn't offered an install option yet. If you opened this link from Instagram, WhatsApp,
              or Facebook, that's expected — their built-in browser can't install apps.
            </p>
            <p style={{ color: "#334155", fontWeight: 600, marginBottom: 12 }}>
              Copy this link and open it in Chrome or Safari instead:
            </p>
            <p style={{ color: "#0369a1", fontSize: 13, wordBreak: "break-all", marginBottom: 16 }}>
              {typeof window !== "undefined" ? window.location.href : ""}
            </p>
            <button className="secondary" onClick={() => window.location.reload()} style={{ width: "100%" }}>
              I've opened it in Chrome/Safari — try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
    );
    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    setDismissed(sessionStorage.getItem("installBannerDismissed") === "1");

    function onPrompt(e) {
      e.preventDefault();
      setDeferred(e);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    sessionStorage.setItem("installBannerDismissed", "1");
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  if (standalone || dismissed) return null;
  if (!deferred && !isIos) return null;

  return (
    <div className="install-banner">
      {deferred ? (
        <>
          <span>Add Elevate to your home screen for one-tap access.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={install}>Install</button>
            <button className="secondary" onClick={dismiss}>Not now</button>
          </div>
        </>
      ) : (
        <>
          <span>On iPhone: tap Share, then "Add to Home Screen".</span>
          <button className="secondary" onClick={dismiss}>Got it</button>
        </>
      )}
    </div>
  );
}

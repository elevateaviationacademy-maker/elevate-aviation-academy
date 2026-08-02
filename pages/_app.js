import { useEffect } from "react";
import "../styles/globals.css";
import InstallGate from "../components/InstallGate";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <InstallGate>
      <Component {...pageProps} />
    </InstallGate>
  );
}

// "Install app" support. Chrome/Edge/Android fire `beforeinstallprompt`, which lets us
// show the browser's own install dialog. Safari and Firefox don't, so for those we show
// instructions instead. Imported from main.tsx so the event is caught even if it fires
// before the app has finished loading.
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallPlatform = "ios" | "safari-mac" | "firefox" | "chromium" | "other";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = isStandalone();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // keep it for our own button instead of the mini-infobar
  deferred = e as BeforeInstallPromptEvent;
  notify();
});

window.addEventListener("appinstalled", () => {
  installed = true;
  deferred = null;
  notify();
});

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but has a touchscreen.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Edg\/|Chrome\/|Chromium\//.test(ua)) return "chromium";
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return "safari-mac";
  return "other";
}

export function useInstall() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  return {
    installed,
    /** True when the browser's own install dialog can be shown. */
    canPrompt: deferred !== null,
    platform: detectPlatform(),
    async prompt(): Promise<boolean> {
      if (!deferred) return false;
      const event = deferred;
      deferred = null; // each event can only be used once
      notify();
      await event.prompt();
      return (await event.userChoice).outcome === "accepted";
    },
  };
}

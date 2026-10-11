import { useState } from "react";
import { useInstall, type InstallPlatform } from "../install";

/** Sidebar button that installs the app, or explains how when the browser can't do it directly. */
export function InstallButton() {
  const { installed, canPrompt, platform, prompt } = useInstall();
  const [help, setHelp] = useState(false);

  if (installed) return null;

  return (
    <>
      <button type="button" className="install-btn" onClick={() => (canPrompt ? void prompt() : setHelp(true))}>
        ⤓ Install app
      </button>
      {help && <InstallHelp platform={platform} onClose={() => setHelp(false)} />}
    </>
  );
}

function InstallHelp({ platform, onClose }: { platform: InstallPlatform; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Install the app">
        <header>
          <h2>Install Peach Papers</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </header>
        <p className="muted">It gets its own icon and window, opens offline, and updates itself.</p>
        <Steps platform={platform} />
      </div>
    </div>
  );
}

function Steps({ platform }: { platform: InstallPlatform }) {
  switch (platform) {
    case "ios":
      return (
        <ol className="install-steps">
          <li>
            Open this page in <b>Safari</b> (other browsers on iPhone/iPad may not offer this).
          </li>
          <li>
            Tap the <b>Share</b> button <span className="glyph">⬆︎</span> — at the bottom on iPhone, top-right on iPad.
          </li>
          <li>
            Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
        </ol>
      );
    case "safari-mac":
      return (
        <ol className="install-steps">
          <li>
            In the menu bar, choose <b>File → Add to Dock…</b>
          </li>
          <li>
            Click <b>Add</b>. Peach Papers will appear in your Dock and Applications folder.
          </li>
          <li className="muted">Needs macOS Sonoma or newer.</li>
        </ol>
      );
    case "firefox":
      return (
        <ol className="install-steps">
          <li>Firefox can't install websites as apps.</li>
          <li>
            Open this page in <b>Chrome</b>, <b>Edge</b> or <b>Safari</b> and click <b>Install app</b> again.
          </li>
        </ol>
      );
    default:
      return (
        <ol className="install-steps">
          <li>
            Look for the <b>install icon</b> at the right end of the address bar and click it.
          </li>
          <li>
            Or open the browser menu: Chrome <b>⋮ → Cast, save, and share → Install Peach's Paper Storage</b>; Edge{" "}
            <b>⋯ → Apps → Install this site as an app</b>; Android <b>⋮ → Install app</b>.
          </li>
          <li className="muted">If it only offers "Create shortcut", reload the page once and try again.</li>
        </ol>
      );
  }
}

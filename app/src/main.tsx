import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { isConfigured } from "./config";
import { SetupNeeded } from "./components/SetupNeeded";
import "./styles.css";
import "./install"; // listen for the browser's install event as early as possible

// Only load Firebase once the app has been configured.
const App = lazy(() => import("./App"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isConfigured ? (
      <Suspense fallback={<div className="splash">🍑</div>}>
        <App />
      </Suspense>
    ) : (
      <SetupNeeded />
    )}
  </StrictMode>,
);

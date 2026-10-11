export function SetupNeeded() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>🍑 Peach's Paper Storage</h1>
        <p>This copy of the app hasn't been connected to a backend yet.</p>
        <p>
          Set the <code>VITE_FIREBASE_*</code> and <code>VITE_WORKER_URL</code> values (see <code>app/.env.example</code> and
          the README's setup guide), then rebuild.
        </p>
      </div>
    </div>
  );
}

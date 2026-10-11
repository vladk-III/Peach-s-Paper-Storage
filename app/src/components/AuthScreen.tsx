import { useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth } from "../firebase";
import { InstallButton } from "./InstallButton";

type Mode = "signin" | "signup" | "reset";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      } else {
        await sendPasswordResetEmail(auth, email);
        setInfo("Check your email for a link to reset your password.");
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>🍑 Peach's Paper Storage</h1>
        <p className="muted">
          {mode === "signin" ? "Sign in to your library" : mode === "signup" ? "Create your account" : "Reset your password"}
        </p>
        {mode === "signup" && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {mode !== "reset" && (
          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        <button className="primary" disabled={busy}>
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
        {mode !== "reset" && (
          <button type="button" onClick={google}>
            Continue with Google
          </button>
        )}
        <div className="auth-links">
          {mode !== "signin" && (
            <button type="button" className="link" onClick={() => setMode("signin")}>
              Have an account? Sign in
            </button>
          )}
          {mode !== "signup" && (
            <button type="button" className="link" onClick={() => setMode("signup")}>
              New here? Create an account
            </button>
          )}
          {mode === "signin" && (
            <button type="button" className="link" onClick={() => setMode("reset")}>
              Forgot password?
            </button>
          )}
        </div>
        <InstallButton />
      </form>
    </div>
  );
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password.";
    case "auth/email-already-in-use":
      return "There's already an account with that email.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/popup-blocked":
    case "auth/popup-closed-by-user":
      return "The Google sign-in window was closed or blocked.";
    case "auth/network-request-failed":
      return "No connection. Sign-in needs internet the first time.";
    default:
      return (err as Error).message ?? "Something went wrong.";
  }
}

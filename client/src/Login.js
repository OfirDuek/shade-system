// Login.js
// Minimal, focused comments explaining the main pieces of the component.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Login.css";

function Login() {
  // ===== Local state: login form =====
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ===== Local state: register form (modal) =====
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  // ===== UI / errors =====
  const [errorMessage, setErrorMessage] = useState("");
  const [regError, setRegError] = useState("");
  const [showRegister, setShowRegister] = useState(false);

  const navigate = useNavigate();

  /**
   * Map common English server/network error messages to Hebrew texts.
   * Used whenever the server returns a readable string.
   */
  const mapToHebrewError = (msg = "") => {
    const m = String(msg || "").toLowerCase();

    // Auth & validation
    if (m.includes("invalid username or password") || m.includes("incorrect") || m.includes("unauthorized"))
      return "שם משתמש או סיסמה לא נכונים!";
    if (m.includes("username required") || m.includes("missing username"))
      return "יש להזין שם משתמש.";
    if (m.includes("password required") || m.includes("missing password"))
      return "יש להזין סיסמה.";
    if (m.includes("user not found"))
      return "המשתמש לא נמצא.";
    if (m.includes("email already exists"))
      return "האימייל כבר רשום במערכת.";
    if (m.includes("username already exists"))
      return "שם המשתמש כבר בשימוש.";
    if (m.includes("invalid email"))
      return "כתובת האימייל אינה תקינה.";
    if (m.includes("weak password"))
      return "הסיסמה חלשה מדי.";
    if (m.includes("too many") || m.includes("rate limit"))
      return "יותר מדי ניסיונות. נסו שוב מאוחר יותר.";

    // Server / network
    if (m.includes("network") || m.includes("failed to fetch"))
      return "אין תקשורת עם השרת. בדקו את החיבור ונסו שוב.";
    if (m.includes("server") || m.includes("internal") || m.includes("500"))
      return "שגיאת שרת. נסו שוב מאוחר יותר.";
    if (m.includes("forbidden") || m.includes("403"))
      return "אין לכם הרשאה לבצע פעולה זו.";
    if (m.includes("not found") || m.includes("404"))
      return "המשאב המבוקש לא נמצא.";
    if (m.includes("bad request") || m.includes("400"))
      return "בקשה לא תקינה.";
    if (m.includes("unprocessable") || m.includes("422"))
      return "הנתונים שנשלחו אינם תקינים.";

    // Default: if Hebrew already, use it; otherwise generic auth error
    return /[א-ת]/.test(msg) ? msg : "שם משתמש או סיסמה לא נכונים.";
  };

  /**
   * Fallback mapping from HTTP status → Hebrew message,
   * for cases where the server didn’t send a readable string.
   */
  const mapStatusToHebrew = (status) => {
    switch (status) {
      case 0:
        return "אין תקשורת עם השרת. בדקו את החיבור ונסו שוב.";
      case 400:
        return "בקשה לא תקינה.";
      case 401:
        return "שם משתמש או סיסמה לא נכונים!";
      case 403:
        return "אין לכם הרשאה לבצע פעולה זו.";
      case 404:
        return "המשאב המבוקש לא נמצא.";
      case 422:
        return "הנתונים שנשלחו אינם תקינים.";
      case 429:
        return "יותר מדי ניסיונות. נסו שוב מאוחר יותר.";
      case 500:
      default:
        return "שגיאת שרת. נסו שוב מאוחר יותר.";
    }
  };

  // Open registration modal and reset all registration fields/errors.
  const openRegister = () => {
    setRegUsername("");
    setRegPassword("");
    setRegConfirm("");
    setRegEmail("");
    setRegPhone("");
    setRegError("");
    setErrorMessage("");
    setShowRegister(true);
  };

  // Close registration modal and clear its state.
  const closeRegister = () => {
    setShowRegister(false);
    setRegUsername("");
    setRegPassword("");
    setRegConfirm("");
    setRegEmail("");
    setRegPhone("");
    setRegError("");
  };

  /**
   * Submit login:
   * - Basic client-side validation
   * - POST to /api/login
   * - On success, persist auth details to localStorage and go to /areaList
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    // Quick client-side checks (Hebrew messages for UX)
    if (!username.trim() && !password.trim()) {
      setErrorMessage("יש להזין שם משתמש וסיסמה.");
      return;
    }
    if (!username.trim()) {
      setErrorMessage("יש להזין שם משתמש.");
      return;
    }
    if (!password.trim()) {
      setErrorMessage("יש להזין סיסמה.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      let data = {};
      try {
        data = await res.json(); // may fail if server didn’t return JSON
      } catch {
        // ignore non-JSON bodies
      }

      if (res.ok && data?.success) {
        // Persist minimal identity & RBAC artifacts for later pages
        const uname = (data?.username || username || "").trim();
        localStorage.setItem("shade_username", uname);

        if (typeof data.role !== "undefined") {
          localStorage.setItem("shade_role", String(data.role));
        }
        if (data.token) {
          localStorage.setItem("shade_token", data.token);
          // Set default Authorization header for axios calls elsewhere in the app
          axios.defaults.headers.common.Authorization = `Bearer ${data.token}`;
        }

        // Navigate to the main list after successful login
        navigate("/areaList");
      } else {
        // Prefer server-provided message; otherwise map by status code
        const serverMsg = data?.error || data?.message || "";
        const msg = serverMsg ? mapToHebrewError(serverMsg) : mapStatusToHebrew(res.status);
        setErrorMessage(msg);
      }
    } catch (err) {
      // Network / CORS / server down
      console.error("שגיאת התחברות:", err);
      setErrorMessage("אין תקשורת עם השרת. בדקו את החיבור ונסו שוב.");
    }
  };

  /**
   * Submit registration:
   * - Validate required fields and password match
   * - POST to /api/register
   * - On success, close modal (user can then login)
   */
  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setRegError("");

    const u = regUsername.trim();
    const p = regPassword.trim();
    const c = regConfirm.trim();
    const em = regEmail.trim();
    const ph = regPhone.trim();

    if (!u || !p || !c || !em || !ph) {
      setRegError("יש למלא את כל הפרטים.");
      return;
    }
    if (p !== c) {
      setRegError("הסיסמאות אינן תואמות.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: u,
          password: p,
          email: em,
          phone: ph,
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        // ignore non-JSON bodies
      }

      if (res.ok && data?.success) {
        // Keep UX simple: inform and close modal
        window.alert("ההרשמה הצליחה! אפשר להתחבר עכשיו.");
        closeRegister();
      } else {
        const serverMsg = data?.error || data?.message || "";
        const msg = serverMsg ? mapToHebrewError(serverMsg) : mapStatusToHebrew(res.status);
        setRegError(msg || "שגיאה בהרשמה.");
      }
    } catch (err) {
      console.error("שגיאת הרשמה:", err);
      setRegError("אין תקשורת עם השרת. בדקו את החיבור ונסו שוב.");
    }
  };

  // Simple, inline background style (keeps the component self-contained)
  const backgroundStyle = {
    backgroundImage: 'url("/HIT.jpg")',
    backgroundSize: "cover",
    backgroundPosition: "center",
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  };

  return (
    <div style={backgroundStyle}>
      <div className="login-container">
        <h2>התחברות</h2>

        {/* Login form */}
        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="שם משתמש"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errorMessage && <div className="error-message">{errorMessage}</div>}
          <button type="submit">התחבר</button>
        </form>

        {/* Toggle registration modal */}
        <div className="register-link" onClick={openRegister}>
          לא רשומים עדיין? הירשמו עכשיו
        </div>

        {/* Registration modal */}
        {showRegister && (
          <div className="register-modal">
            <div className="register-content">
              <h2>הרשמה</h2>
              <form onSubmit={handleRegister}>
                <input
                  type="text"
                  placeholder="שם משתמש"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="סיסמה"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="אימות סיסמה"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                />
                <input
                  type="email"
                  placeholder="כתובת מייל"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
                <input
                  type="tel"
                  placeholder="טלפון"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                />
                {regError && <div className="error-message">{regError}</div>}
                <button type="submit">הרשמה</button>
                <button type="button" onClick={closeRegister}>
                  ביטול
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Login;

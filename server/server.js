// ===== ייבוא ספריות והגדרות בסיס =====
const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const db = require("./db"); // Pool של MySQL2
require("dotenv").config();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";


const app = express();
const PORT = 5000;

// ===== תיקיית העלאות =====
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

// ================= אחסון קבצים =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const name = file.originalname.replace(/\s+/g, "_");
    const time = new Date().toISOString().replace(/[:.]/g, "-");
    cb(null, `${time}-${name}`);
  },
});
const upload = multer({ storage });

// ================= התחברות / הרשמה =================
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  try {
    // אפשר גם SELECT * אם את מעדיפה, אבל עדיף לצמצם לשדות שצריך
    const [results] = await db.query(
      "SELECT id, username, role FROM users WHERE username = ? AND password = ?",
      [username, password]
    );

    if (results.length > 0) {
      const user = results[0];

      // מייצרים JWT עם פרטי הבסיס (ללא סיסמה)
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      // מחזירים גם token וגם role/username כדי שהפרונט ידע להציג הרשאות
      res.json({
        success: true,
        token,
        role: user.role,
        username: user.username,
      });
    } else {
      res.status(401).json({ success: false, error: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" ");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET); // {id, username, role}
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(roleNeeded) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (Number(req.user.role) !== Number(roleNeeded))
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}


// ולידציות בסיסיות ומניעת כפילויות
app.post("/api/register", async (req, res) => {
  // אל מקבלים role מהקליינט. הוא תמיד 2 ברישום דרך השרת
  let username = (req.body?.username ?? "").toString().trim();
  let password = (req.body?.password ?? "").toString().trim();
  let email    = (req.body?.email ?? "").toString().trim().toLowerCase();
  let phone    = (req.body?.phone ?? "").toString().trim();

  if (!username) return res.status(400).json({ error: "חובה למלא שם משתמש" });
  if (!password) return res.status(400).json({ error: "חובה למלא סיסמה" });
  if (!email)    return res.status(400).json({ error: "חובה למלא כתובת מייל" });
  if (!phone)    return res.status(400).json({ error: "חובה למלא מספר טלפון" });

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "כתובת מייל אינה חוקית" });
  }

  const phoneRegex = /^\d{10}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: "מספר הפלאפון אינו חוקי" });
  }

  try {
    // מניעת כפילויות
    const [u] = await db.query("SELECT 1 FROM users WHERE username=? LIMIT 1", [username]);
    if (u.length) return res.json({ success: false, error: "שם המשתמש כבר קיים" });

    const [e] = await db.query("SELECT 1 FROM users WHERE email=? LIMIT 1", [email]);
    if (e.length) return res.json({ success: false, error: "כבר קיים משתמש עם כתובת זו" });

    const [p] = await db.query("SELECT 1 FROM users WHERE phone=? LIMIT 1", [phone]);
    if (p.length) return res.json({ success: false, error: "מספר הטלפון כבר קיים" });

    // >>> השינוי הקריטי: מוסיפים עמודת role ל-INSERT ושולחים 2 כמספר
    await db.query(
      "INSERT INTO users (username, password, email, phone, role) VALUES (?, ?, ?, ?, ?)",
      [username, password, email, phone, 2]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// רשימת משתמשים (ללא סיסמא)
app.get("/api/users", requireAuth, requireRole(1), async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, username, email, phone, role FROM users ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// עדכון משתמש (email/phone/role)
app.put("/api/users/:id", requireAuth, requireRole(1), async (req, res) => {
  try {
    const { email, phone, role } = req.body;
    const fields = [];
    const vals = [];
    if (email) { fields.push("email=?"); vals.push(String(email).trim().toLowerCase()); }
    if (phone) { fields.push("phone=?"); vals.push(String(phone).trim()); }
    if (typeof role !== "undefined") { fields.push("role=?"); vals.push(Number(role)); }
    if (!fields.length) return res.status(400).json({ error: "No fields to update" });
    vals.push(req.params.id);
    await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id=?`, vals);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// מחיקת משתמש (Admin בלבד)
app.delete("/api/users/:id", requireAuth, requireRole(1), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    await db.query("DELETE FROM users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= אזורים =================
app.post("/api/areas/upload", requireAuth, requireRole(1), upload.single("path"), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!req.file || !name || !description) {
      return res
        .status(400)
        .json({ error: "חובה למלא שם, תיאור ולהעלות תמונה." });
    }
    const filePath = req.file.filename;
    const [result] = await db.query(
      "INSERT INTO areas (name, description, path) VALUES (?, ?, ?)",
      [name, description, filePath]
    );
    res.json({ id: result.insertId, name, description, path: filePath });
  } catch (err) {
    console.error("Upload error:", err); // יופיע בטרמינל
    res.status(500).json({ error: err.message });
  }
});

// רשימת כל האזורים
app.get("/api/areas", async (req, res) => {
  try {
    const [results] = await db.query("SELECT * FROM areas");
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// אזור לפי שם 
app.get("/api/areas/name/:name", async (req, res) => {
  try {
    const areaName = decodeURIComponent(req.params.name);
    const [results] = await db.query("SELECT * FROM areas WHERE name = ?", [
      areaName,
    ]);
    if (results.length === 0)
      return res.status(404).json({ error: "אזור לא נמצא" });
    res.json(results[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// עדכון אזור
app.put("/api/areas/name/:name", requireAuth, requireRole(1), upload.single("path"), async (req, res) => {
  try {
    const { name, description } = req.body;
    const oldName = req.params.name;
    const filePath = req.file ? req.file.filename : null;

    const fields = [];
    const values = [];

    if (name) {
      fields.push("name = ?");
      values.push(name);
    }
    if (description) {
      fields.push("description = ?");
      values.push(description);
    }
    if (filePath) {
      fields.push("path = ?");
      values.push(filePath);
      const [oldFile] = await db.query(
        "SELECT path FROM areas WHERE name = ?",
        [oldName]
      );
      if (oldFile[0]?.path)
        fs.unlink(path.join(__dirname, "uploads", oldFile[0].path), () => {});
    }

    if (fields.length === 0)
      return res.status(400).json({ error: "אין נתונים לעדכון" });
    values.push(oldName);

    await db.query(
      `UPDATE areas SET ${fields.join(", ")} WHERE name = ?`,
      values
    );
    res.json({ message: "האזור עודכן בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// מחיקת אזור – מוחק גם את התמונה והצללות שקשורות אליו
app.delete("/api/areas/name/:name", requireAuth, requireRole(1), async (req, res) => {
  try {
    const areaName = decodeURIComponent(req.params.name);
    const [area] = await db.query("SELECT id, path FROM areas WHERE name = ?", [
      areaName,
    ]);
    if (!area[0]) return res.status(404).json({ error: "אזור לא נמצא" });

    if (area[0].path)
      fs.unlink(path.join(__dirname, "uploads", area[0].path), () => {});

    await db.query("DELETE FROM shades WHERE Area = ?", [area[0].id]);
    await db.query("DELETE FROM areas WHERE id = ?", [area[0].id]);
    res.json({ message: "אזור נמחק בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= הצללות =================
app.post("/api/shades", requireAuth, requireRole(1), async (req, res) => {
  try {
    const { Area, width, height, percentage, description, x, y } = req.body;
    if (
      !Area ||
      !width ||
      !height ||
      !percentage ||
      !description ||
      x == null ||
      y == null
    ) {
      return res
        .status(400)
        .json({ error: "יש למלא את כל השדות: אחוז, תיאור, מיקום וגודל" });
    }

    const [area] = await db.query("SELECT id FROM areas WHERE name = ?", [
      Area,
    ]);
    if (area.length === 0)
      return res.status(400).json({ error: "אזור לא נמצא במסד הנתונים" });

    const areaId = area[0].id;
    const [result] = await db.query(
      "INSERT INTO shades (Area, width, height, percentage, description, x, y) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [areaId, width, height, percentage, description, x, y]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// כל ההצללות לפי שם אזור
app.get("/api/shades/:name", async (req, res) => {
  try {
    const areaName = decodeURIComponent(req.params.name);
    const [results] = await db.query(
      `SELECT s.* FROM shades s JOIN areas a ON s.Area = a.id WHERE a.name = ?`,
      [areaName]
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// עדכון הצללה
app.put("/api/shades/:id", requireAuth, requireRole(1), async (req, res) => {
  try {
    const { width, height, percentage, description, x, y } = req.body;
    const fields = [];
    const values = [];

    if (width) {
      fields.push("width = ?");
      values.push(width);
    }
    if (height) {
      fields.push("height = ?");
      values.push(height);
    }
    if (percentage) {
      fields.push("percentage = ?");
      values.push(percentage);
    }
    if (description) {
      fields.push("description = ?");
      values.push(description);
    }
    if (x != null) {
      fields.push("x = ?");
      values.push(x);
    }
    if (y != null) {
      fields.push("y = ?");
      values.push(y);
    }

    if (fields.length === 0)
      return res.status(400).json({ error: "אין שדות לעדכון" });

    values.push(req.params.id);
    await db.query(
      `UPDATE shades SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    res.json({ message: "הצללה עודכנה בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// מחיקת הצללה לפי מזהה
app.delete("/api/shades/:id", requireAuth, requireRole(1), async (req, res) => {
  try {
    await db.query("DELETE FROM shades WHERE id = ?", [req.params.id]);
    res.json({ message: "הצללה נמחקה בהצלחה" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= הרצת השרת =================
app.listen(PORT, () => {
  console.log(`🚀 השרת רץ על http://localhost:${PORT}`);
});

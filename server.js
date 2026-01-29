const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");
const { Pool } = require("pg");
const session = require("express-session");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// --------- Setup Session ----------
app.use(session({
  secret: "supersecretkey", // change this for production
  resave: false,
  saveUninitialized: true,
}));

// --------- Setup Database ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create table if it doesn't exist
pool.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
)
`).catch(console.error);

// --------- Routes ----------

// Home (Login page)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Register page
app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

// Dashboard (only if logged in)
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Register API
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "Missing fields" });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users(username, password) VALUES($1, $2)",
      [username, hash]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ error: "User already exists" });
  }
});

// Login API
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE username=$1",
    [username]
  );

  const user = result.rows[0];
  if (!user) return res.json({ error: "Invalid login" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ error: "Invalid login" });

  req.session.user = { id: user.id, username: user.username };
  res.json({ success: true });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

app.use("/uploads", express.static("uploads"));

app.get("/files", (req, res) => {
  fs.readdir("./uploads", (err, files) => {
    if (err) return res.json([]);
    res.json(files);
  });
});

const upload = multer({ storage });

app.post("/upload", upload.single("pdf"), async (req, res) => {
  if (!req.file) {
    return res.json({ success: false, error: "No file uploaded" });
  }

  res.json({
    success: true,
    filename: req.file.filename
  });
});

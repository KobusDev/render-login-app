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
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// --------- SESSION ----------
app.use(session({
  secret: "supersecretkey",
  resave: false,
  saveUninitialized: true,
}));

// --------- DATABASE ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create users table if not exists
pool.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
)
`).catch(console.error);

// --------- MULTER SETUP ----------
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// --------- ROUTES ----------

// Home (login)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Register page
app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

// Dashboard (requires login)
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// --------- AUTH ----------
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

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// --------- PDF UPLOAD & FILES ----------
app.post("/upload", upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.json({ success: false, error: "No file uploaded" });
  res.json({ success: true, filename: req.file.filename });
});

app.use("/uploads", express.static("uploads"));

app.get("/files", (req, res) => {
  fs.readdir("./uploads", (err, files) => {
    if (err) return res.json([]);
    res.json(files);
  });
});

// --------- SUMMARY ----------
app.get("/summary", async (req, res) => {
  const files = fs.readdirSync("./uploads");
  let totalIncome = 0;
  let totalOutgoing = 0;

  for (const file of files) {
    const dataBuffer = fs.readFileSync(path.join("./uploads", file));
    try {
      const pdfData = await pdfParse(dataBuffer);
      const lines = pdfData.text.split("\n");

      let inTable = false;

      lines.forEach(line => {
        if(line.includes("Transactions in RAND") || line.match(/Date\s+Description\s+Amount\s+Balance/)){
          inTable = true;
          return;
        }
        if(inTable && line.trim() === "") inTable = false;

        if(inTable){
          const parts = line.trim().split(/\s+/);
          if(parts.length >= 4){
            const amount = parseFloat(parts[parts.length - 2].replace(/[, ]/g, "")); // note added \u202F
            if (!isNaN(amount)){
              if(amount > 0) totalIncome += amount;
              else totalOutgoing += Math.abs(amount);
            }
          }
        }
      });

    } catch (err) {
      console.log("Error parsing PDF:", file, err);
    }
  }

  res.json({ totalIncome, totalOutgoing });
});

// --------- TRANSACTIONS ----------
app.get("/transactions", async (req, res) => {
  const files = fs.readdirSync("./uploads");
  let transactions = [];

  for (const file of files) {
    const dataBuffer = fs.readFileSync(path.join("./uploads", file));
    try {
      const pdfData = await pdfParse(dataBuffer);
      const lines = pdfData.text.split("\n");

      let inTable = false;

      lines.forEach(line => {
        if(line.includes("Transactions in RAND") || line.match(/Date\s+Description\s+Amount\s+Balance/)){
          inTable = true;
          return;
        }
        if(inTable && line.trim() === "") inTable = false;

        if(inTable){
          const parts = line.trim().split(/\s+/);
          if(parts.length >= 4){
            const date = parts[0];
            const balance = parseFloat(parts[parts.length - 1].replace(/[, ]/g, ""));
            const amount = parseFloat(parts[parts.length - 2].replace(/[, ]/g, "")); // note added \u202F
            const description = parts.slice(1, parts.length - 2).join(" ");

            transactions.push({
              file,
              date,
              description,
              amount,
              balance
            });
          }
        }
      });

    } catch (err) {
      console.log("Error parsing PDF:", file, err);
    }
  }

  res.json(transactions);
});

// --------- START SERVER ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

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
  ssl: {
    rejectUnauthorized: false
  }
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

// --------- PDF UPLOAD & LIST ----------

// Upload PDF
app.post("/upload", upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.json({ success: false, error: "No file uploaded" });
  res.json({ success: true, filename: req.file.filename });
});

// Serve uploaded PDFs
app.use("/uploads", express.static("uploads"));

// List uploaded files
app.get("/files", (req, res) => {
  fs.readdir("./uploads", (err, files) => {
    if (err) return res.json([]);
    res.json(files);
  });
});

// PDF SUMMARY (income/outgoing)
app.get("/summary", async (req, res) => {
  const files = fs.readdirSync("./uploads");
  let totalIncome = 0;
  let totalOutgoing = 0;

  for (const file of files) {
    const dataBuffer = fs.readFileSync(path.join("./uploads", file));
    try {
      const pdfData = await pdfParse(dataBuffer);
      const text = pdfData.text;

      const amounts = text.match(/[-+]?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g);
      if (amounts) {
        for (const amt of amounts) {
          const num = parseFloat(amt.replace(/,/g, ""));
          if (num > 0) totalIncome += num;
          else totalOutgoing += Math.abs(num);
        }
      }
    } catch (err) {
      console.log("Error parsing PDF:", file, err);
    }
  }

  res.json({ totalIncome, totalOutgoing });
});

// Get all transactions from PDFs
app.get("/transactions", async (req, res) => {
  const files = fs.readdirSync("./uploads");
  let transactions = [];

  for (const file of files) {
    const dataBuffer = fs.readFileSync(path.join("./uploads", file));
    try {
      const pdfData = await pdfParse(dataBuffer);
      const lines = pdfData.text.split("\n");

      lines.forEach(line => {
        const amounts = line.match(/[-+]?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g);
        if (amounts) {
          amounts.forEach(amt => {
            const num = parseFloat(amt.replace(/,/g, ""));
            if (!isNaN(num)) {
              transactions.push({
                file,
                line: line.trim(),
                amount: num
              });
            }
          });
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

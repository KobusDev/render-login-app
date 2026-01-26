const express = require("express");
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(express.json());

const db = new sqlite3.Database("./users.db");

// Create table
db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
)
`);

// Home
app.get("/", (req, res) => {
  res.send("✅ Login server running");
});

// Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ error: "Missing fields" });
  }

  const hash = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users(username, password) VALUES(?,?)",
    [username, hash],
    function (err) {
      if (err) {
        return res.json({ error: "User already exists" });
      }
      res.json({ success: true });
    }
  );
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (!user) return res.json({ error: "Invalid login" });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.json({ error: "Invalid login" });

      res.json({ success: true });
    }
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

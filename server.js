const express = require("express");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());

// TEMP in-memory users (for testing only)
const users = [];

// Home
app.get("/", (req, res) => {
  res.send("✅ Server running (no database yet)");
});

// Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ error: "Missing fields" });
  }

  const exists = users.find(u => u.username === username);
  if (exists) return res.json({ error: "User exists" });

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });

  res.json({ success: true });
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);
  if (!user) return res.json({ error: "Invalid login" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ error: "Invalid login" });

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

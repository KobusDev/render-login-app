const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // Serve HTML files

// TEMP in-memory users
const users = [];

// Home (Login page)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Register page
app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

// Register API
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "Missing fields" });

  if (users.find(u => u.username === username)) return res.json({ error: "User exists" });

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });

  res.json({ success: true });
});

// Login API
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

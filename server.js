
const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "quotes.db");
const SEED_PATH = path.join(
  __dirname,
  "data",
  "quote_history_seed.json"
);

if (!fs.existsSync(SEED_PATH)) {
  console.error("Seed file not found:", SEED_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);
const seedQuotes = JSON.parse(
  fs.readFileSync(SEED_PATH, "utf8")
);

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

db.exec(`
  CREATE TABLE IF NOT EXISTS favorite_quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_text TEXT NOT NULL,
    author TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT 'General',
    source_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_favorite_quotes_created
  ON favorite_quotes(created_at DESC);
`);

const pick = (arr) =>
  arr[Math.floor(Math.random() * arr.length)];

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Get a random quote from the public API.
// Use local seed data if the API is unavailable.
app.get("/api/quote", async (_req, res) => {
  try {
    const response = await fetch(
      "https://dummyjson.com/quotes/random",
      {
        signal: AbortSignal.timeout(5000),
        headers: { Accept: "application/json" }
      }
    );

    if (!response.ok) {
      throw new Error(`Quote API returned ${response.status}`);
    }

    const data = await response.json();

    return res.json({
      text: data.quote,
      author: data.author || "Unknown",
      topic: "General",
      source: "api"
    });
  } catch (error) {
    console.error("Using fallback quote data:", error.message);

    const fallback = pick(seedQuotes);

    return res.json({
      text: fallback.text ?? fallback.quote ?? "Keep learning every day.",
      author: fallback.author || "Unknown",
      topic: fallback.topic || "General",
      source: "fallback"
    });
  }
});

// Get saved favorites, with optional search and topic filters.
app.get("/api/favorites", (req, res) => {
  const search = String(req.query.search || "").trim();
  const topic = String(req.query.topic || "").trim();

  let sql = "SELECT * FROM favorite_quotes WHERE 1=1";
  const params = [];

  if (search) {
    sql += " AND (quote_text LIKE ? OR author LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  if (topic && topic !== "All") {
    sql += " AND topic = ?";
    params.push(topic);
  }

  sql += " ORDER BY created_at DESC, id DESC";

  res.json(db.prepare(sql).all(...params));
});

// Save a quote to favorites.
app.post("/api/favorites", (req, res) => {
  const {
    text,
    author,
    topic = "General",
    sourceId = null
  } = req.body || {};

  if (
    typeof text !== "string" ||
    !text.trim() ||
    typeof author !== "string" ||
    !author.trim()
  ) {
    return res.status(400).json({
      error: "Quote text and author are required."
    });
  }

  const cleanText = text.trim();
  const cleanAuthor = author.trim();

  const existing = db.prepare(`
    SELECT * FROM favorite_quotes
    WHERE quote_text = ? AND author = ?
  `).get(cleanText, cleanAuthor);

  if (existing) {
    return res.status(200).json({
      favorite: existing,
      alreadySaved: true
    });
  }

  const result = db.prepare(`
    INSERT INTO favorite_quotes
      (quote_text, author, topic, source_id)
    VALUES (?, ?, ?, ?)
  `).run(
    cleanText,
    cleanAuthor,
    String(topic || "General").trim(),
    sourceId
  );

  const favorite = db.prepare(`
    SELECT * FROM favorite_quotes WHERE id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({
    favorite,
    alreadySaved: false
  });
});

// Delete a saved favorite.
app.delete("/api/favorites/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid favorite ID." });
  }

  const result = db.prepare(
    "DELETE FROM favorite_quotes WHERE id = ?"
  ).run(id);

  if (!result.changes) {
    return res.status(404).json({
      error: "Favorite not found."
    });
  }

  res.status(204).end();
});

// Serve the frontend for other browser routes.
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(
    `Quote Generator running on http://localhost:${PORT}`
  );
});

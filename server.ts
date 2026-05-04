import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import path from "path";
import fs from "fs";

// Initialize environment variables
dotenv.config();

const app = express();
const PORT = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

// API Routes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    appUrl: process.env.VITE_APP_URL || 'not set'
  });
});

app.post("/api/ocr", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const apiKey = process.env.OCR_API_KEY;
    if (!apiKey || apiKey === "") {
      return res.status(400).json({ error: "OCR_API_KEY is missing. Please add it to your secrets." });
    }

    const fileBuffer = file.buffer;
    const base64Image = `data:${file.mimetype};base64,${fileBuffer.toString("base64")}`;

    const formData = new FormData();
    formData.append("base64Image", base64Image);
    formData.append("apikey", apiKey);
    formData.append("isOverlayRequired", "false");
    formData.append("language", "jpn");
    formData.append("OCREngine", "2");

    const response = await axios.post("https://api.ocr.space/parse/image", formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 45000 // 45s timeout
    });

    if (response.data.OCRExitCode !== 1) {
      const errorMsg = response.data.ErrorMessage?.[0] || response.data.ErrorDetails || "OCR Processing failed";
      console.error("OCR API Error Details:", response.data);
      return res.status(400).json({ 
        error: errorMsg
      });
    }

    const text = response.data.ParsedResults?.[0]?.ParsedText || "";
    res.json({ text });
  } catch (error: any) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.ErrorMessage?.[0] || error.response?.data?.ErrorDetails || error.message;
    console.error(`OCR Error [${status}]:`, error.response?.data || error.message);
    res.status(status).json({ error: `OCR Service Error: ${message}` });
  }
});

// Proxy for Jisho API to avoid CORS and rate limiting
const jishoCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
let lastJishoCall = 0;
const MIN_CALL_INTERVAL = 500; // 500ms between external calls

app.get("/api/jisho", async (req, res) => {
  try {
    const keyword = req.query.keyword as string;
    if (!keyword) {
      return res.status(400).json({ error: "Keyword is required" });
    }

    // Check cache
    const cached = jishoCache.get(keyword);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return res.json(cached.data);
    }

    // Basic rate limiting for external calls
    const now = Date.now();
    const wait = MIN_CALL_INTERVAL - (now - lastJishoCall);
    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }
    lastJishoCall = Date.now();

    const response = await axios.get(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(keyword)}`, {
      headers: {
        'User-Agent': 'KotobaStudyApp/1.0 (Educational Tool; Japanese Language Learning)'
      },
      timeout: 15000 // 15s timeout
    });

    // Save to cache
    jishoCache.set(keyword, { data: response.data, timestamp: Date.now() });

    // Limit cache size to 1000 entries
    if (jishoCache.size > 1000) {
      const firstKey = jishoCache.keys().next().value;
      if (firstKey !== undefined) jishoCache.delete(firstKey);
    }

    res.json(response.data);
  } catch (error: any) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message;
    console.error(`Jisho Error [${status}]:`, message);
    
    // If we have stale cache, return it on error
    const staleContent = jishoCache.get(req.query.keyword as string);
    if (staleContent) {
      return res.json(staleContent.data);
    }

    if (status === 429) {
      return res.status(429).json({ error: "Dictionary service is busy. Please try again in a moment." });
    }

    res.status(status).json({ error: `Jisho API Error: ${message}` });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || `http://localhost:${PORT}`;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on ${appUrl}`);
    console.log(`API endpoints: ${appUrl}/api/ocr, ${appUrl}/api/jisho`);
  });
}

startServer();
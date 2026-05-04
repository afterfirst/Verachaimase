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
  console.log(`[Server] Request: ${req.method} ${req.url}`);
  next();
});

const apiRouter = express.Router();
app.use("/api", apiRouter);

// Explicit health check
apiRouter.get("/health", (req, res) => {
  console.log("[Server] hit /api/health");
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    distExists: fs.existsSync(path.resolve(process.cwd(), "dist"))
  });
});

// Test POST route
apiRouter.post("/test-post", (req, res) => {
  console.log("[Server] hit /api/test-post");
  res.json({ status: "ok", message: "POST is working correctly" });
});

apiRouter.post("/ocr", upload.single("file"), async (req, res) => {
  console.log("[Server] hit /api/ocr");
  try {
    const file = req.file;
    if (!file) {
      console.warn("[Server] /api/ocr: No file in request");
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
    formData.append("OCREngine", "3");

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

apiRouter.get("/jisho", async (req, res) => {
  console.log("[Server] hit /api/jisho");
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

app.use("/api", apiRouter);

async function startServer() {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'undefined'}`);
  console.log(`[Server] Is Production: ${isProduction}`);
  console.log(`[Server] CWD: ${process.cwd()}`);

  if (!isProduction) {
    console.log("[Server] Starting in DEVELOPMENT mode with Vite middleware");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("[Server] Critical error starting Vite middleware:", e);
    }
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    const indexHtmlPath = path.join(distPath, "index.html");
    console.log(`[Server] Starting in PRODUCTION mode.`);
    console.log(`[Server] Serving assets from: ${distPath}`);
    
    if (fs.existsSync(distPath)) {
      console.log("[Server] Found 'dist' directory.");
      
      // Serve static files with a long max-age for hashed assets
      app.use(express.static(distPath, {
        index: false,
        maxAge: '1d'
      }));

      // Catch-all for SPA routing - but ONLY for non-file requests
      app.get("*", (req, res, next) => {
        // If the request looks like a file (has an extension), don't serve index.html
        // This prevents the "MIME type text/html" error for missing JS/CSS files
        if (req.url.includes('.') && !req.url.endsWith('.html')) {
          return next();
        }

        if (fs.existsSync(indexHtmlPath)) {
          res.sendFile(indexHtmlPath);
        } else {
          console.error(`[Server] index.html not found at ${indexHtmlPath}`);
          res.status(404).send("Application shell not found. Please ensure the app is built.");
        }
      });
    } else {
      console.error("[Server] CRITICAL: 'dist' directory not found!");
      // Fallback for preview environments where build might be missing
      try {
        console.log("[Server] Attempting fallback to Vite middleware...");
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
        console.log("[Server] Fallbacked to Vite middleware successfully.");
      } catch (e) {
        console.error("[Server] Failed to fallback to Vite middleware:", e);
      }
    }
  }

  // Global 404 handler for API or other unmatched routes
  app.use((req, res) => {
    console.warn(`[Server] 404 - Unmatched Request: ${req.method} ${req.url}`);
    res.status(404).json({
      error: "Route not found",
      method: req.method,
      path: req.url
    });
  });

  const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || `http://localhost:${PORT}`;
  
  if (process.env.VERCEL) {
    console.log("Running in Vercel environment - skipping app.listen()");
    return;
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on ${appUrl}`);
    console.log(`API endpoints: ${appUrl}/api/ocr, ${appUrl}/api/jisho`);
    
    // Debug: Print registered routes
    console.log("[Server] Registered routes:");
    app._router.stack.forEach((r: any) => {
      if (r.route && r.route.path) {
        console.log(`[Server] Route: ${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
      }
    });
  });
}

// Start the server (for local dev and standard Node environments)
startServer();

// Export for Vercel serverless function support
export default app;
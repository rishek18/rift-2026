import express from "express";
import { createServer as createViteServer } from "vite";
import { DetectionEngine } from "./src/services/detectionEngine.ts";
import { Transaction } from "./src/types.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for large datasets
  app.use(express.json({ limit: '50mb' }));

  // API routes
  app.post("/api/analyze", (req, res) => {
    try {
      const { transactions } = req.body as { transactions: Transaction[] };
      
      if (!transactions || !Array.isArray(transactions)) {
        return res.status(400).json({ error: "Invalid transactions data" });
      }

      const engine = new DetectionEngine(transactions);
      const result = engine.analyze();
      
      res.json(result);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Internal server error during analysis" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

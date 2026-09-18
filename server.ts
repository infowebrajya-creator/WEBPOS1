import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Security & CORS Headers
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // REST API: SYSTEM HEALTH MONITORING
  app.get("/api/health", async (req, res) => {
    try {
      let supabaseStatus: "HEALTHY" | "DEGRADED" | "UNCONFIGURED" = "UNCONFIGURED";
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://jkkwrhywfpbitwvffkxx.supabase.co";
      const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_D1rREhO08nd1vWNmxyugCg_Fff4X10Y";

      if (supabaseUrl && supabaseKey) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const sbRes = await fetch(`${supabaseUrl}/rest/v1/`, {
            headers: { apikey: supabaseKey },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          supabaseStatus = sbRes.ok || sbRes.status === 404 || sbRes.status === 200 || sbRes.status === 401 ? "HEALTHY" : "DEGRADED";
        } catch {
          supabaseStatus = "DEGRADED";
        }
      }

      return res.json({
        status: supabaseStatus === "DEGRADED" ? "DEGRADED" : "HEALTHY",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || "production",
        services: {
          api: "HEALTHY",
          supabase: supabaseStatus
        }
      });
    } catch {
      return res.status(503).json({
        status: "FAILED",
        timestamp: new Date().toISOString(),
        error: "Critical failure during health evaluation"
      });
    }
  });

  // Vite Integration & Static Asset Serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[The Xings Kitchen POS Server] Running on port ${PORT}`);
  });
}

startServer();

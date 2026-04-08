import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";

const app = new Hono();

app.use("*", logger());
app.use(
	"/api/*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT) || 3000;
console.log(`Server running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });

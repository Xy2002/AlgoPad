import "dotenv/config";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import recoverRoutes from "./routes/recover";
import registerRoutes from "./routes/register";
import syncRoutes from "./routes/sync";

const app = new OpenAPIHono();

// Middleware
app.use("*", logger());
app.use(
	"/api/*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Routes
app.route("/", registerRoutes);
app.route("/", recoverRoutes);
app.route("/", syncRoutes);

// OpenAPI spec
app.doc("/api/doc", {
	openapi: "3.0.0",
	info: {
		version: "1.0.0",
		title: "AlgoPad Sync API",
	},
});

// Scalar API docs UI
app.get("/api/docs", (c) => {
	const html = `<!DOCTYPE html>
<html>
<head>
  <title>AlgoPad Sync API</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <script id="api-reference" data-url="/api/doc"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
	return c.html(html);
});

const port = Number(process.env.PORT) || 3000;
console.log(`Server running on http://localhost:${port}`);
console.log(`API docs at http://localhost:${port}/api/docs`);
serve({ fetch: app.fetch, port });

export default app;

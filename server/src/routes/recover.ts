import { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { recoverRoute } from "../types/api";

const app = new OpenAPIHono();

app.use("*", authMiddleware);

// === GET /api/recover ===
app.openapi(recoverRoute, async (c) => {
	const userId = c.get("userId" as never) as string;
	const db = getDb();

	const [user] = await db
		.select({ keySalt: users.keySalt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) {
		return c.json({ error: "User not found" }, 401);
	}

	return c.json({ salt: user.keySalt }, 200);
});

export default app;

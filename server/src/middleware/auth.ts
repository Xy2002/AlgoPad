import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { getDb } from "../db/client";

export async function authMiddleware(c: Context, next: Next) {
	const authHeader = c.req.header("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return c.json({ error: "Missing or invalid Authorization header" }, 401);
	}

	const token = authHeader.slice(7);
	if (!token) {
		return c.json({ error: "Empty token" }, 401);
	}

	const db = getDb();
	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, token))
		.limit(1);

	if (!user) {
		return c.json({ error: "Invalid token" }, 401);
	}

	c.set("userId", user.id);
	await next();
}

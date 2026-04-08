import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
	if (_db) return _db;

	const driver = process.env.DATABASE_DRIVER || "node-postgres";
	const url = process.env.DATABASE_URL;

	if (!url) {
		throw new Error("DATABASE_URL environment variable is not set");
	}

	if (driver === "neon") {
		throw new Error(
			"Neon driver not configured yet. Use node-postgres for now.",
		);
	}

	_db = drizzle(url, { schema });
	return _db;
}

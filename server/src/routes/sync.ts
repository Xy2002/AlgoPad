import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db/client";
import { files, folders, settings, users } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { syncPullRoute, syncPushRoute, syncStatusRoute } from "../types/api";

const app = new OpenAPIHono();

// All sync routes require auth
app.use("/api/*", authMiddleware);

// === GET /api/sync/status ===
app.openapi(syncStatusRoute, async (c) => {
	const userId = c.get("userId" as never) as string;
	const db = getDb();

	const userFiles = await db
		.select({
			id: files.id,
			version: files.version,
			updatedAt: files.updatedAt,
		})
		.from(files)
		.where(eq(files.userId, userId));

	const userFolders = await db
		.select({
			id: folders.id,
			version: folders.version,
			updatedAt: folders.updatedAt,
		})
		.from(folders)
		.where(eq(folders.userId, userId));

	const [userSettings] = await db
		.select({ version: settings.version, updatedAt: settings.updatedAt })
		.from(settings)
		.where(eq(settings.userId, userId))
		.limit(1);

	const fileMap: Record<string, { version: number; updatedAt: string }> = {};
	for (const f of userFiles) {
		fileMap[f.id] = {
			version: f.version,
			updatedAt: f.updatedAt.toISOString(),
		};
	}

	const folderMap: Record<string, { version: number; updatedAt: string }> = {};
	for (const f of userFolders) {
		folderMap[f.id] = {
			version: f.version,
			updatedAt: f.updatedAt.toISOString(),
		};
	}

	return c.json(
		{
			files: fileMap,
			folders: folderMap,
			settings: userSettings
				? {
						version: userSettings.version,
						updatedAt: userSettings.updatedAt.toISOString(),
					}
				: null,
		},
		200,
	);
});

// === POST /api/sync/push ===
app.openapi(syncPushRoute, async (c) => {
	const userId = c.get("userId" as never) as string;
	const body = c.req.valid("json");
	const db = getDb();

	const results: {
		files?: Record<
			string,
			{ success: boolean; version?: number; error?: string }
		>;
		folders?: Record<
			string,
			{ success: boolean; version?: number; error?: string }
		>;
		settings?: { success: boolean; version?: number; error?: string };
	} = {};

	// Push files
	if (body.files && body.files.length > 0) {
		results.files = {};
		for (const file of body.files) {
			const [existing] = await db
				.select({ version: files.version })
				.from(files)
				.where(and(eq(files.id, file.id), eq(files.userId, userId)))
				.limit(1);

			if (!existing) {
				await db.insert(files).values({
					id: file.id,
					userId,
					encryptedData: file.encryptedData,
					version: 1,
					deletedAt: file.deletedAt ? new Date(file.deletedAt) : null,
				});
				results.files[file.id] = { success: true, version: 1 };
			} else if (file.version >= existing.version) {
				const newVersion = existing.version + 1;
				await db
					.update(files)
					.set({
						encryptedData: file.encryptedData,
						version: newVersion,
						updatedAt: new Date(),
						deletedAt: file.deletedAt ? new Date(file.deletedAt) : null,
					})
					.where(eq(files.id, file.id));
				results.files[file.id] = { success: true, version: newVersion };
			} else {
				results.files[file.id] = {
					success: false,
					version: existing.version,
					error: "Stale version",
				};
			}
		}
	}

	// Push folders (same logic as files)
	if (body.folders && body.folders.length > 0) {
		results.folders = {};
		for (const folder of body.folders) {
			const [existing] = await db
				.select({ version: folders.version })
				.from(folders)
				.where(and(eq(folders.id, folder.id), eq(folders.userId, userId)))
				.limit(1);

			if (!existing) {
				await db.insert(folders).values({
					id: folder.id,
					userId,
					encryptedData: folder.encryptedData,
					version: 1,
					deletedAt: folder.deletedAt ? new Date(folder.deletedAt) : null,
				});
				results.folders[folder.id] = { success: true, version: 1 };
			} else if (folder.version >= existing.version) {
				const newVersion = existing.version + 1;
				await db
					.update(folders)
					.set({
						encryptedData: folder.encryptedData,
						version: newVersion,
						updatedAt: new Date(),
						deletedAt: folder.deletedAt ? new Date(folder.deletedAt) : null,
					})
					.where(eq(folders.id, folder.id));
				results.folders[folder.id] = { success: true, version: newVersion };
			} else {
				results.folders[folder.id] = {
					success: false,
					version: existing.version,
					error: "Stale version",
				};
			}
		}
	}

	// Push settings
	if (body.settings) {
		const [existing] = await db
			.select({ version: settings.version })
			.from(settings)
			.where(eq(settings.userId, userId))
			.limit(1);

		if (!existing) {
			await db.insert(settings).values({
				userId,
				encryptedData: body.settings.encryptedData,
				version: 1,
			});
			results.settings = { success: true, version: 1 };
		} else if (body.settings.version >= existing.version) {
			const newVersion = existing.version + 1;
			await db
				.update(settings)
				.set({
					encryptedData: body.settings.encryptedData,
					version: newVersion,
					updatedAt: new Date(),
				})
				.where(eq(settings.userId, userId));
			results.settings = { success: true, version: newVersion };
		} else {
			results.settings = {
				success: false,
				version: existing.version,
				error: "Stale version",
			};
		}
	}

	// Update lastSyncAt
	await db
		.update(users)
		.set({ lastSyncAt: new Date() })
		.where(eq(users.id, userId));

	return c.json({ results }, 200);
});

// === POST /api/sync/pull ===
app.openapi(syncPullRoute, async (c) => {
	const userId = c.get("userId" as never) as string;
	const body = c.req.valid("json");
	const since = new Date(body.since);
	const db = getDb();

	const pulledFiles = await db
		.select({
			id: files.id,
			encryptedData: files.encryptedData,
			version: files.version,
			updatedAt: files.updatedAt,
			deletedAt: files.deletedAt,
		})
		.from(files)
		.where(and(eq(files.userId, userId), gt(files.updatedAt, since)));

	const pulledFolders = await db
		.select({
			id: folders.id,
			encryptedData: folders.encryptedData,
			version: folders.version,
			updatedAt: folders.updatedAt,
			deletedAt: folders.deletedAt,
		})
		.from(folders)
		.where(and(eq(folders.userId, userId), gt(folders.updatedAt, since)));

	const [pulledSettings] = await db
		.select({
			encryptedData: settings.encryptedData,
			version: settings.version,
			updatedAt: settings.updatedAt,
		})
		.from(settings)
		.where(and(eq(settings.userId, userId), gt(settings.updatedAt, since)))
		.limit(1);

	return c.json(
		{
			files: pulledFiles.map((f) => ({
				id: f.id,
				encryptedData: f.encryptedData,
				version: f.version,
				updatedAt: f.updatedAt.toISOString(),
				deletedAt: f.deletedAt?.toISOString() ?? null,
			})),
			folders: pulledFolders.map((f) => ({
				id: f.id,
				encryptedData: f.encryptedData,
				version: f.version,
				updatedAt: f.updatedAt.toISOString(),
				deletedAt: f.deletedAt?.toISOString() ?? null,
			})),
			settings: pulledSettings
				? {
						encryptedData: pulledSettings.encryptedData,
						version: pulledSettings.version,
						updatedAt: pulledSettings.updatedAt.toISOString(),
					}
				: null,
		},
		200,
	);
});

export default app;

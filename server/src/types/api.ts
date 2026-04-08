import { createRoute, z } from "@hono/zod-openapi";

// === Register ===

export const RegisterResponseSchema = z.object({
	token: z.uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
	salt: z.string().openapi({ example: "base64-encoded-salt" }),
});

export const registerRoute = createRoute({
	method: "post",
	path: "/api/register",
	responses: {
		200: {
			content: { "application/json": { schema: RegisterResponseSchema } },
			description: "User registered successfully",
		},
	},
});

// === Auth Error ===

export const ErrorResponseSchema = z.object({
	error: z.string(),
});

// === Sync Status ===

export const EntityVersionSchema = z.object({
	version: z.number().int().openapi({ example: 3 }),
	updatedAt: z.string().openapi({ example: "2026-04-07T10:00:00Z" }),
});

export const SyncStatusResponseSchema = z.object({
	files: z.record(z.string(), EntityVersionSchema),
	folders: z.record(z.string(), EntityVersionSchema),
	settings: EntityVersionSchema.nullable(),
});

export const syncStatusRoute = createRoute({
	method: "get",
	path: "/api/sync/status",
	responses: {
		200: {
			content: {
				"application/json": { schema: SyncStatusResponseSchema },
			},
			description: "Sync status retrieved",
		},
		401: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "Unauthorized",
		},
	},
});

// === Sync Push ===

export const PushFileSchema = z.object({
	id: z.string(),
	encryptedData: z.string(),
	version: z.number().int(),
	deletedAt: z.string().nullable().optional(),
});

export const PushFolderSchema = z.object({
	id: z.string(),
	encryptedData: z.string(),
	version: z.number().int(),
	deletedAt: z.string().nullable().optional(),
});

export const PushSettingsSchema = z.object({
	encryptedData: z.string(),
	version: z.number().int(),
});

export const PushRequestSchema = z.object({
	files: z.array(PushFileSchema).optional(),
	folders: z.array(PushFolderSchema).optional(),
	settings: PushSettingsSchema.optional(),
});

export const PushResultSchema = z.object({
	success: z.boolean(),
	version: z.number().int().optional(),
	error: z.string().optional(),
});

export const PushResponseSchema = z.object({
	results: z.object({
		files: z.record(z.string(), PushResultSchema).optional(),
		folders: z.record(z.string(), PushResultSchema).optional(),
		settings: PushResultSchema.optional(),
	}),
});

export const syncPushRoute = createRoute({
	method: "post",
	path: "/api/sync/push",
	request: {
		body: {
			content: { "application/json": { schema: PushRequestSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: PushResponseSchema } },
			description: "Push results",
		},
		401: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "Unauthorized",
		},
	},
});

// === Sync Pull ===

export const PullRequestSchema = z.object({
	since: z.string().openapi({ example: "2026-04-07T09:00:00Z" }),
});

export const PulledFileSchema = z.object({
	id: z.string(),
	encryptedData: z.string(),
	version: z.number().int(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable(),
});

export const PulledFolderSchema = z.object({
	id: z.string(),
	encryptedData: z.string(),
	version: z.number().int(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable(),
});

export const PulledSettingsSchema = z.object({
	encryptedData: z.string(),
	version: z.number().int(),
	updatedAt: z.string(),
});

export const PullResponseSchema = z.object({
	files: z.array(PulledFileSchema),
	folders: z.array(PulledFolderSchema),
	settings: PulledSettingsSchema.nullable(),
});

// === Recover ===

export const RecoverResponseSchema = z.object({
	salt: z.string().openapi({ example: "base64-encoded-salt" }),
});

export const recoverRoute = createRoute({
	method: "get",
	path: "/api/recover",
	responses: {
		200: {
			content: {
				"application/json": { schema: RecoverResponseSchema },
			},
			description: "Recovery info retrieved",
		},
		401: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "Invalid token",
		},
	},
});

// === Sync Pull ===

export const syncPullRoute = createRoute({
	method: "post",
	path: "/api/sync/pull",
	request: {
		body: {
			content: { "application/json": { schema: PullRequestSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: PullResponseSchema } },
			description: "Pulled changes",
		},
		401: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "Unauthorized",
		},
	},
});

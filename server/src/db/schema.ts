import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: uuid("id").primaryKey(),
	keySalt: text("key_salt").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
});

export const files = pgTable(
	"files",
	{
		id: uuid("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		encryptedData: text("encrypted_data").notNull(),
		version: integer("version").notNull().default(1),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [index("idx_files_user_id").on(table.userId)],
);

export const folders = pgTable(
	"folders",
	{
		id: uuid("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		encryptedData: text("encrypted_data").notNull(),
		version: integer("version").notNull().default(1),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [index("idx_folders_user_id").on(table.userId)],
);

export const settings = pgTable("settings", {
	userId: uuid("user_id")
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	encryptedData: text("encrypted_data").notNull(),
	version: integer("version").notNull().default(1),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

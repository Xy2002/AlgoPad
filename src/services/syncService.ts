import { decrypt, deriveKey, encrypt } from "./cryptoService";
import { usePlaygroundStore } from "@/store/usePlaygroundStore";

const API_BASE = "/api";
const SYNC_DEBOUNCE_MS = 3000;

let cryptoKey: CryptoKey | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

type StoreState = ReturnType<typeof usePlaygroundStore.getState>;

async function getOrDeriveKey(store: StoreState): Promise<CryptoKey> {
	if (cryptoKey) return cryptoKey;
	const { syncToken, syncSalt } = store;
	if (!syncToken || !syncSalt) throw new Error("No sync credentials");
	cryptoKey = await deriveKey(syncToken, syncSalt);
	return cryptoKey;
}

async function apiFetch<T>(
	path: string,
	options: RequestInit = {},
	token?: string | null,
): Promise<T> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options.headers as Record<string, string>),
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error(body.error || `HTTP ${res.status}`);
	}
	return res.json();
}

// === Register ===

export async function register(store: StoreState): Promise<void> {
	const data = await apiFetch<{ token: string; salt: string }>("/register", {
		method: "POST",
	});
	store.setSyncToken(data.token);
	store.setSyncSalt(data.salt);
	store.setIsFirstSync(true);

	// Save to localStorage
	localStorage.setItem("playground_sync_token", data.token);
	localStorage.setItem("playground_sync_salt", data.salt);

	// Derive key
	cryptoKey = await deriveKey(data.token, data.salt);
}

// === Pull ===

export async function pull(store: StoreState): Promise<void> {
	const { syncToken } = store;
	if (!syncToken) return;

	const key = await getOrDeriveKey(store);
	const data = await apiFetch<{
		files: Array<{
			id: string;
			encryptedData: string;
			version: number;
			updatedAt: string;
			deletedAt: string | null;
		}>;
		folders: Array<{
			id: string;
			encryptedData: string;
			version: number;
			updatedAt: string;
			deletedAt: string | null;
		}>;
		settings: {
			encryptedData: string;
			version: number;
			updatedAt: string;
		} | null;
	}>(
		"/sync/pull",
		{
			method: "POST",
			body: JSON.stringify({
				since: new Date(0).toISOString(),
			}),
		},
		syncToken,
	);

	// Decrypt and merge files
	const fileUpdates: Record<string, number> = {};
	for (const file of data.files) {
		if (file.deletedAt) {
			const currentFiles = { ...store.files };
			delete currentFiles[file.id];
			const currentContents = { ...store.fileContents };
			delete currentContents[file.id];
			usePlaygroundStore.setState({
				files: currentFiles,
				fileContents: currentContents,
			});
		} else {
			try {
				const decrypted = await decrypt(key, file.encryptedData);
				const fileInfo = JSON.parse(decrypted);
				usePlaygroundStore.setState({
					files: {
						...usePlaygroundStore.getState().files,
						[file.id]: fileInfo,
					},
					fileContents: {
						...usePlaygroundStore.getState().fileContents,
						[file.id]: fileInfo.content,
					},
				});
			} catch {
				console.error(`Failed to decrypt file ${file.id}`);
			}
		}
		fileUpdates[file.id] = file.version;
	}

	// Decrypt and merge folders
	const folderUpdates: Record<string, number> = {};
	for (const folder of data.folders) {
		if (folder.deletedAt) {
			const currentFolders = { ...store.folders };
			delete currentFolders[folder.id];
			usePlaygroundStore.setState({ folders: currentFolders });
		} else {
			try {
				const decrypted = await decrypt(key, folder.encryptedData);
				const folderInfo = JSON.parse(decrypted);
				usePlaygroundStore.setState({
					folders: {
						...usePlaygroundStore.getState().folders,
						[folder.id]: folderInfo,
					},
				});
			} catch {
				console.error(`Failed to decrypt folder ${folder.id}`);
			}
		}
		folderUpdates[folder.id] = folder.version;
	}

	// Decrypt and merge settings
	if (data.settings) {
		try {
			const decrypted = await decrypt(key, data.settings.encryptedData);
			const settingsData = JSON.parse(decrypted);
			if (settingsData.userSettings) {
				usePlaygroundStore.setState({ settings: settingsData.userSettings });
			}
			if (settingsData.llmSettings) {
				usePlaygroundStore.setState({ llmSettings: settingsData.llmSettings });
			}
		} catch {
			console.error("Failed to decrypt settings");
		}
	}

	store.setSyncVersions({
		files: fileUpdates,
		folders: folderUpdates,
		settings: data.settings?.version ?? 0,
	});
}

// === Push ===

export async function push(store: StoreState): Promise<void> {
	const { syncToken, syncVersions } = store;
	if (!syncToken) return;

	store.setSyncStatus("syncing");
	const key = await getOrDeriveKey(store);

	try {
		const body: Record<string, unknown> = {};

		// Encrypt files
		const filesPayload = [];
		for (const [id, fileInfo] of Object.entries(store.files)) {
			const plaintext = JSON.stringify(fileInfo);
			const encryptedData = await encrypt(key, plaintext);
			filesPayload.push({
				id,
				encryptedData,
				version: syncVersions.files[id] ?? 0,
			});
		}
		if (filesPayload.length > 0) {
			body.files = filesPayload;
		}

		// Encrypt folders
		const foldersPayload = [];
		for (const [id, folderInfo] of Object.entries(store.folders)) {
			const plaintext = JSON.stringify(folderInfo);
			const encryptedData = await encrypt(key, plaintext);
			foldersPayload.push({
				id,
				encryptedData,
				version: syncVersions.folders[id] ?? 0,
			});
		}
		if (foldersPayload.length > 0) {
			body.folders = foldersPayload;
		}

		// Encrypt settings
		const settingsPlaintext = JSON.stringify({
			userSettings: store.settings,
			llmSettings: store.llmSettings,
		});
		const settingsEncrypted = await encrypt(key, settingsPlaintext);
		body.settings = {
			encryptedData: settingsEncrypted,
			version: syncVersions.settings,
		};

		const result = await apiFetch<{
			results: {
				files?: Record<string, { success: boolean; version?: number }>;
				folders?: Record<string, { success: boolean; version?: number }>;
				settings?: { success: boolean; version?: number };
			};
		}>(
			"/sync/push",
			{
				method: "POST",
				body: JSON.stringify(body),
			},
			syncToken,
		);

		// Update local versions from server response
		const versionUpdates: {
			files?: Record<string, number>;
			folders?: Record<string, number>;
			settings?: number;
		} = {};

		if (result.results.files) {
			const fileVersions: Record<string, number> = {};
			for (const [id, r] of Object.entries(result.results.files)) {
				if (r.success && r.version) fileVersions[id] = r.version;
			}
			versionUpdates.files = fileVersions;
		}

		if (result.results.folders) {
			const folderVersions: Record<string, number> = {};
			for (const [id, r] of Object.entries(result.results.folders)) {
				if (r.success && r.version) folderVersions[id] = r.version;
			}
			versionUpdates.folders = folderVersions;
		}

		if (result.results.settings?.success && result.results.settings.version) {
			versionUpdates.settings = result.results.settings.version;
		}

		store.setSyncVersions(versionUpdates);
		store.setSyncStatus("idle");
	} catch {
		store.setSyncStatus("error");
	}
}

// === Recover (enter existing token on new device) ===

export async function recover(token: string): Promise<void> {
	const store = usePlaygroundStore.getState();

	store.setSyncStatus("syncing");

	try {
		// Fetch salt from server using the token
		const data = await apiFetch<{ salt: string }>(
			"/recover",
			{ method: "GET" },
			token,
		);

		// Save credentials
		store.setSyncToken(token);
		store.setSyncSalt(data.salt);
		localStorage.setItem("playground_sync_token", token);
		localStorage.setItem("playground_sync_salt", data.salt);

		// Derive encryption key
		cryptoKey = await deriveKey(token, data.salt);

		// Pull remote data
		await pull(usePlaygroundStore.getState());

		// Push local data
		await push(usePlaygroundStore.getState());
	} catch (err) {
		store.setSyncStatus("error");
		throw err;
	}
}

// === Disconnect ===

export function disconnect(): void {
	const store = usePlaygroundStore.getState();
	store.setSyncToken(null);
	store.setSyncSalt(null);
	store.setSyncStatus("idle");
	store.setIsFirstSync(false);
	store.setSyncVersions({ files: {}, folders: {}, settings: 0 });
	localStorage.removeItem("playground_sync_token");
	localStorage.removeItem("playground_sync_salt");
	cryptoKey = null;
}

// === Initialize ===

export async function initSync(): Promise<void> {
	const store = usePlaygroundStore.getState();

	// Load saved credentials
	const savedToken = localStorage.getItem("playground_sync_token");
	const savedSalt = localStorage.getItem("playground_sync_salt");

	if (savedToken && savedSalt) {
		store.setSyncToken(savedToken);
		store.setSyncSalt(savedSalt);
		cryptoKey = await deriveKey(savedToken, savedSalt);

		// Pull remote data
		try {
			await pull(store);
		} catch (err) {
			console.error("Initial pull failed:", err);
		}

		// Push local data
		try {
			await push(store);
		} catch (err) {
			console.error("Initial push failed:", err);
		}
	} else {
		// Register new user
		await register(store);
		// Push initial local data to server
		try {
			await push(store);
		} catch (err) {
			console.error("Initial push failed:", err);
		}
	}
}

// Called from store subscription for auto-sync
export function onStoreChange(): void {
	const store = usePlaygroundStore.getState();
	if (!store.syncToken || store.syncStatus === "syncing") return;

	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		push(usePlaygroundStore.getState()).catch((err) => {
			console.error("Auto-push failed:", err);
		});
	}, SYNC_DEBOUNCE_MS);
}

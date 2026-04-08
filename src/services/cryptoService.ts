const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

function bufferToBase64(buffer: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

export async function deriveKey(
	token: string,
	saltBase64: string,
): Promise<CryptoKey> {
	const salt = base64ToBuffer(saltBase64);
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(token),
		"PBKDF2",
		false,
		["deriveKey"],
	);

	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: "AES-GCM", length: KEY_LENGTH },
		false,
		["encrypt", "decrypt"],
	);
}

export async function encrypt(
	key: CryptoKey,
	plaintext: string,
): Promise<string> {
	const encoder = new TextEncoder();
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		encoder.encode(plaintext),
	);

	// Format: base64(iv) + "." + base64(ciphertext)
	const ivBase64 = bufferToBase64(iv.buffer);
	const ctBase64 = bufferToBase64(ciphertext);
	return `${ivBase64}.${ctBase64}`;
}

export async function decrypt(
	key: CryptoKey,
	encrypted: string,
): Promise<string> {
	const [ivBase64, ctBase64] = encrypted.split(".");
	const iv = base64ToBuffer(ivBase64);
	const ciphertext = base64ToBuffer(ctBase64);

	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		key,
		ciphertext,
	);

	return new TextDecoder().decode(plaintext);
}

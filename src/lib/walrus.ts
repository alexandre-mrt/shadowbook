/**
 * Walrus blob storage — HTTP aggregator/publisher interface.
 *
 * Uses the public Walrus testnet HTTP endpoints directly (no on-chain transaction required).
 * Store: PUT to publisher /v1/blobs
 * Fetch: GET from aggregator /v1/blobs/{blobId}
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALRUS_TESTNET_PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";
const WALRUS_TESTNET_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";

/** Default number of epochs to store blobs for */
const DEFAULT_STORE_EPOCHS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WalrusStoreResponse {
	newlyCreated?: {
		blobObject: {
			blobId: string;
		};
	};
	alreadyCertified?: {
		blobId: string;
	};
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Store encrypted order bytes on Walrus testnet via the HTTP publisher.
 * Returns the blob ID string.
 *
 * Throws on network failure or non-2xx response.
 */
export async function storeEncryptedOrder(encryptedData: Uint8Array): Promise<string> {
	const url = `${WALRUS_TESTNET_PUBLISHER_URL}/v1/blobs?epochs=${DEFAULT_STORE_EPOCHS}`;

	const response = await fetch(url, {
		method: "PUT",
		headers: { "Content-Type": "application/octet-stream" },
		body: encryptedData.buffer as ArrayBuffer,
	});

	if (!response.ok) {
		throw new Error(`Walrus store failed: HTTP ${response.status} ${response.statusText}`);
	}

	const result = (await response.json()) as WalrusStoreResponse;

	const blobId = result.newlyCreated?.blobObject.blobId ?? result.alreadyCertified?.blobId;

	if (!blobId) {
		throw new Error("Walrus store: unexpected response — no blobId returned");
	}

	return blobId;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch encrypted order bytes from Walrus testnet via the HTTP aggregator.
 * Returns the raw bytes.
 *
 * Throws on network failure or non-2xx response.
 */
export async function fetchEncryptedOrder(blobId: string): Promise<Uint8Array> {
	const url = `${WALRUS_TESTNET_AGGREGATOR_URL}/v1/blobs/${encodeURIComponent(blobId)}`;

	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(
			`Walrus fetch failed: HTTP ${response.status} ${response.statusText} for blobId ${blobId}`,
		);
	}

	const buffer = await response.arrayBuffer();
	return new Uint8Array(buffer);
}

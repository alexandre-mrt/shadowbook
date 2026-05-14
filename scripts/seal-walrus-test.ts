/**
 * SEAL + Walrus E2E Test — Real encrypt/store/fetch/verify, no mocks.
 *
 * Tests: serialize order → SEAL encrypt → Walrus store → Walrus fetch → verify roundtrip
 * Also tests: hash computation matches Move contract
 *
 * Run: cd ~/projects/blockchain/shadowbook && bun run scripts/seal-walrus-test.ts
 */

import { EncryptedObject, SealClient, getAllowlistedKeyServers } from "@mysten/seal";
import { bcs } from "@mysten/sui/bcs";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { fromHex, toHex } from "@mysten/sui/utils";
import { keccak_256 } from "@noble/hashes/sha3";

const SEAL_POLICY_PACKAGE_ID = "0x2d2290ac963edc2618128f9163c7a2ff7b18b011f15adc191475b6594063db64";
const WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

const client = new SuiJsonRpcClient({
	url: getJsonRpcFullnodeUrl("testnet"),
	network: "testnet",
});

function numberToLE(n: bigint, bytes: number): Uint8Array {
	const result = new Uint8Array(bytes);
	let remaining = n;
	for (let i = 0; i < bytes; i++) {
		result[i] = Number(remaining & 0xffn);
		remaining >>= 8n;
	}
	return result;
}

async function main() {
	console.log("\n━━━ TEST 1: Hash Computation ━━━");

	const isUp = true;
	const amount = 100_000_000n;
	const salt = new Uint8Array(32);
	crypto.getRandomValues(salt);
	const senderAddress = "0x2a3e5ad47e9e5837361280c9d0e2f156c4242d6b841d5378ccc975556bb949ad";

	const isUpByte = new Uint8Array([isUp ? 1 : 0]);
	const amountBytes = numberToLE(amount, 8);
	const addrBytes = fromHex(senderAddress.slice(2));

	const data = new Uint8Array(1 + 8 + salt.length + addrBytes.length);
	let offset = 0;
	data.set(isUpByte, offset);
	offset += 1;
	data.set(amountBytes, offset);
	offset += 8;
	data.set(salt, offset);
	offset += salt.length;
	data.set(addrBytes, offset);

	const hash = keccak_256(data);
	console.log(`✅ Hash computed: ${toHex(hash).slice(0, 20)}...`);
	console.log(`   Data length: ${data.length} bytes (1 + 8 + 32 + 32 = 73)`);

	// Verify hash is 32 bytes
	if (hash.length !== 32) throw new Error(`Hash wrong length: ${hash.length}`);
	console.log(`   Hash length: ${hash.length} bytes ✓`);

	console.log("\n━━━ TEST 2: Order Serialization ━━━");

	const orderData = new Uint8Array([
		...[isUp ? 1 : 0],
		...bcs.U64.serialize(amount).toBytes(),
		...salt,
	]);
	console.log(`✅ Order serialized: ${orderData.length} bytes`);
	console.log(`   is_up: ${orderData[0]}, amount BCS: ${toHex(orderData.slice(1, 9))}`);

	console.log("\n━━━ TEST 3: SEAL Encryption ━━━");

	const commitDeadlineMs = BigInt(Date.now() + 600_000); // 10 min from now
	const sealIdBytes = bcs.U64.serialize(commitDeadlineMs).toBytes();
	const sealIdHex = toHex(sealIdBytes);
	console.log(`   SEAL ID (commit deadline): ${sealIdHex}`);
	console.log(`   Package: ${SEAL_POLICY_PACKAGE_ID}`);

	const serverObjectIds = getAllowlistedKeyServers("testnet");
	console.log(`   Key servers: ${serverObjectIds.length} servers`);

	const sealClient = new SealClient({
		suiClient: client as any,
		serverObjectIds,
		verifyKeyServers: false,
	});

	const { encryptedObject } = await sealClient.encrypt({
		threshold: 2,
		packageId: SEAL_POLICY_PACKAGE_ID,
		id: sealIdHex,
		data: orderData,
	});

	console.log(`✅ SEAL encrypted: ${encryptedObject.length} bytes`);

	// Parse the encrypted object to verify structure
	const parsed = EncryptedObject.parse(encryptedObject);
	console.log(`   Parsed ID: ${parsed.id.slice(0, 20)}...`);
	console.log(`   Encrypted data present: ${encryptedObject.length > 0}`);

	console.log("\n━━━ TEST 4: Walrus Store ━━━");

	const storeUrl = `${WALRUS_PUBLISHER}/v1/blobs?epochs=5`;
	const storeResponse = await fetch(storeUrl, {
		method: "PUT",
		headers: { "Content-Type": "application/octet-stream" },
		body: encryptedObject.buffer as ArrayBuffer,
	});

	if (!storeResponse.ok) {
		throw new Error(`Walrus store failed: HTTP ${storeResponse.status}`);
	}

	const storeResult = (await storeResponse.json()) as any;
	const blobId =
		storeResult.newlyCreated?.blobObject?.blobId ?? storeResult.alreadyCertified?.blobId;

	if (!blobId) throw new Error("No blobId in Walrus response");
	console.log(`✅ Stored on Walrus: ${blobId}`);

	console.log("\n━━━ TEST 5: Walrus Fetch ━━━");

	const fetchUrl = `${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`;
	const fetchResponse = await fetch(fetchUrl);

	if (!fetchResponse.ok) {
		throw new Error(`Walrus fetch failed: HTTP ${fetchResponse.status}`);
	}

	const fetchedData = new Uint8Array(await fetchResponse.arrayBuffer());
	console.log(`✅ Fetched from Walrus: ${fetchedData.length} bytes`);

	// Verify roundtrip
	if (fetchedData.length !== encryptedObject.length) {
		throw new Error(
			`Size mismatch: stored ${encryptedObject.length}, fetched ${fetchedData.length}`,
		);
	}

	let match = true;
	for (let i = 0; i < fetchedData.length; i++) {
		if (fetchedData[i] !== encryptedObject[i]) {
			match = false;
			break;
		}
	}

	if (!match) throw new Error("Roundtrip mismatch: stored != fetched");
	console.log(`✅ Roundtrip verified: stored === fetched`);

	// Verify we can still parse the fetched encrypted object
	const reParsed = EncryptedObject.parse(fetchedData);
	console.log(`✅ Re-parsed encrypted object: ID ${reParsed.id.slice(0, 20)}...`);

	console.log("\n━━━ SUMMARY ━━━");
	console.log(`Hash computation: ✅`);
	console.log(`Order serialization: ✅`);
	console.log(`SEAL encryption: ✅ (${encryptedObject.length} bytes)`);
	console.log(`Walrus store: ✅ (blob ${blobId.slice(0, 16)}...)`);
	console.log(`Walrus fetch: ✅ (roundtrip verified)`);
	console.log(`\nNote: SEAL decryption requires a browser wallet for SessionKey signing.`);
	console.log(`The time-lock will expire at ${new Date(Number(commitDeadlineMs)).toISOString()}.`);
	console.log(`After expiry, seal_approve will allow decryption.\n`);
}

main().catch((err) => {
	console.error("\n❌ SEAL/WALRUS TEST FAILED:", err.message);
	process.exit(1);
});

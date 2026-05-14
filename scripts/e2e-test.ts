/**
 * ShadowBook E2E Test — Real testnet transactions, no mocks.
 *
 * Flow: create round → commit order → reveal order → resolve → claim payout
 *
 * Run: cd ~/projects/blockchain/shadowbook && bun run scripts/e2e-test.ts
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// decodeSuiPrivateKey not used — Sui keystore uses raw base64 format
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { keccak_256 } from "@noble/hashes/sha3";

const PACKAGE_ID = "0x2d2290ac963edc2618128f9163c7a2ff7b18b011f15adc191475b6594063db64";
const ADMIN_CAP = "0xfe7b26df82facafba11bf184f4807e36ca5d343e96b07fb07ea60e0cafcc0afd";
const CLOCK = "0x6";

const COMMIT_WINDOW_MS = 20_000; // 20 seconds
const REVEAL_WINDOW_MS = 20_000; // 20 seconds
const BET_AMOUNT_MIST = 100_000_000n; // 0.1 SUI

const client = new SuiJsonRpcClient({
	url: getJsonRpcFullnodeUrl("testnet"),
	network: "testnet",
});

function getKeypair(): Ed25519Keypair {
	const keystorePath = join(homedir(), ".sui", "sui_config", "sui.keystore");
	const keystore: string[] = JSON.parse(readFileSync(keystorePath, "utf-8"));
	const TARGET = "0x2a3e5ad47e9e5837361280c9d0e2f156c4242d6b841d5378ccc975556bb949ad";

	for (const key of keystore) {
		const bytes = Buffer.from(key, "base64");
		if (bytes[0] !== 0) continue;
		const secretKey = bytes.slice(1);
		const kp = Ed25519Keypair.fromSecretKey(secretKey);
		if (kp.getPublicKey().toSuiAddress() === TARGET) return kp;
	}
	throw new Error("Keypair not found in keystore");
}

function numberToLE(n: bigint, bytes: number): Uint8Array {
	const result = new Uint8Array(bytes);
	let remaining = n;
	for (let i = 0; i < bytes; i++) {
		result[i] = Number(remaining & 0xffn);
		remaining >>= 8n;
	}
	return result;
}

function computeOrderHash(
	isUp: boolean,
	amount: bigint,
	salt: Uint8Array,
	senderAddress: string,
): Uint8Array {
	const isUpByte = new Uint8Array([isUp ? 1 : 0]);
	const amountBytes = numberToLE(amount, 8);
	const addrHex = senderAddress.startsWith("0x") ? senderAddress.slice(2) : senderAddress;
	const addrBytes = fromHex(addrHex);

	const data = new Uint8Array(1 + 8 + salt.length + addrBytes.length);
	let offset = 0;
	data.set(isUpByte, offset);
	offset += 1;
	data.set(amountBytes, offset);
	offset += 8;
	data.set(salt, offset);
	offset += salt.length;
	data.set(addrBytes, offset);

	return keccak_256(data);
}

async function signAndExecute(tx: Transaction, keypair: Ed25519Keypair): Promise<string> {
	const result = await client.signAndExecuteTransaction({
		transaction: tx,
		signer: keypair,
		options: { showEffects: true, showEvents: true },
	});

	if (result.effects?.status?.status !== "success") {
		throw new Error(`Transaction failed: ${JSON.stringify(result.effects?.status)}`);
	}

	await sleep(3000);
	return result.digest;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	const keypair = getKeypair();
	const address = keypair.getPublicKey().toSuiAddress();
	console.log(`\n🔑 Address: ${address}`);

	// Step 1: Create round
	console.log("\n━━━ STEP 1: Create Round ━━━");
	const txCreate = new Transaction();
	txCreate.moveCall({
		target: `${PACKAGE_ID}::shadowbook::create_round`,
		arguments: [
			txCreate.object(ADMIN_CAP),
			txCreate.pure.id("0x0000000000000000000000000000000000000000000000000000000000000001"),
			txCreate.pure.u64(999999999999),
			txCreate.pure.u64(105000),
			txCreate.pure.u64(COMMIT_WINDOW_MS),
			txCreate.pure.u64(REVEAL_WINDOW_MS),
			txCreate.object(CLOCK),
		],
	});

	const createDigest = await signAndExecute(txCreate, keypair);
	console.log(`✅ create_round tx: ${createDigest}`);

	await sleep(3000);

	// Find the created Round object
	const txResult = await client.getTransactionBlock({
		digest: createDigest,
		options: { showEvents: true, showObjectChanges: true },
	});

	const roundCreatedEvent = txResult.events?.find((e) => e.type.includes("RoundCreated"));
	const roundId = (roundCreatedEvent?.parsedJson as Record<string, string>)?.round_id;
	if (!roundId) throw new Error("Could not find round_id in events");
	console.log(`📦 Round ID: ${roundId}`);

	// Step 2: Commit order
	console.log("\n━━━ STEP 2: Commit Order ━━━");
	const isUp = true;
	const salt = new Uint8Array(32);
	crypto.getRandomValues(salt);

	const orderHash = computeOrderHash(isUp, BET_AMOUNT_MIST, salt, address);
	console.log(`🔒 Order: UP, ${Number(BET_AMOUNT_MIST) / 1e9} SUI`);
	console.log(`🧂 Salt: ${Buffer.from(salt).toString("hex").slice(0, 16)}...`);
	console.log(`#️⃣  Hash: ${Buffer.from(orderHash).toString("hex").slice(0, 16)}...`);

	const txCommit = new Transaction();
	const [paymentCoin] = txCommit.splitCoins(txCommit.gas, [BET_AMOUNT_MIST]);
	txCommit.moveCall({
		target: `${PACKAGE_ID}::shadowbook::commit_order`,
		arguments: [
			txCommit.object(roundId),
			txCommit.pure.vector("u8", Array.from(orderHash)),
			txCommit.pure.vector("u8", []), // no walrus blob for CLI test
			paymentCoin,
			txCommit.object(CLOCK),
		],
	});

	const commitDigest = await signAndExecute(txCommit, keypair);
	console.log(`✅ commit_order tx: ${commitDigest}`);

	// Verify on-chain
	const roundAfterCommit = await client.getObject({
		id: roundId,
		options: { showContent: true },
	});
	const fieldsAfterCommit = (roundAfterCommit.data?.content as any)?.fields;
	console.log(`📊 Commitments: ${fieldsAfterCommit?.commitments?.fields?.size}`);
	console.log(`💰 Escrowed: ${Number(fieldsAfterCommit?.total_escrowed) / 1e9} SUI`);

	// Step 3: Wait for commit window to expire
	const commitDeadline = Number(fieldsAfterCommit?.commit_deadline_ms);
	const waitCommit = Math.max(0, commitDeadline - Date.now() + 2000);
	console.log(`\n⏳ Waiting ${Math.ceil(waitCommit / 1000)}s for commit window to expire...`);
	await sleep(waitCommit);

	// Step 4: Reveal order
	console.log("\n━━━ STEP 3: Reveal Order ━━━");
	const txReveal = new Transaction();
	txReveal.moveCall({
		target: `${PACKAGE_ID}::shadowbook::reveal_order`,
		arguments: [
			txReveal.object(roundId),
			txReveal.pure.bool(isUp),
			txReveal.pure.u64(BET_AMOUNT_MIST),
			txReveal.pure.vector("u8", Array.from(salt)),
			txReveal.object(CLOCK),
		],
	});

	const revealDigest = await signAndExecute(txReveal, keypair);
	console.log(`✅ reveal_order tx: ${revealDigest}`);

	// Verify reveal
	const roundAfterReveal = await client.getObject({
		id: roundId,
		options: { showContent: true },
	});
	const fieldsAfterReveal = (roundAfterReveal.data?.content as any)?.fields;
	console.log(`📊 Revealed orders: ${fieldsAfterReveal?.revealed_orders?.length}`);
	const revealed = fieldsAfterReveal?.revealed_orders?.[0]?.fields;
	if (revealed) {
		console.log(`   Trader: ${revealed.trader}`);
		console.log(`   Direction: ${revealed.is_up ? "UP" : "DOWN"}`);
		console.log(`   Amount: ${Number(revealed.amount) / 1e9} SUI`);
	}

	// Step 5: Wait for reveal window to expire
	const revealDeadline = Number(fieldsAfterReveal?.reveal_deadline_ms);
	const waitReveal = Math.max(0, revealDeadline - Date.now() + 2000);
	console.log(`\n⏳ Waiting ${Math.ceil(waitReveal / 1000)}s for reveal window to expire...`);
	await sleep(waitReveal);

	// Step 6: Resolve round
	console.log("\n━━━ STEP 4: Resolve Round ━━━");
	const txResolve = new Transaction();
	txResolve.moveCall({
		target: `${PACKAGE_ID}::shadowbook::resolve_round`,
		arguments: [
			txResolve.object(roundId),
			txResolve.object(ADMIN_CAP),
			txResolve.pure.bool(true), // outcome = UP (our bet wins)
			txResolve.object(CLOCK),
		],
	});

	const resolveDigest = await signAndExecute(txResolve, keypair);
	console.log(`✅ resolve_round tx: ${resolveDigest}`);

	// Step 7: Claim payout
	console.log("\n━━━ STEP 5: Claim Payout ━━━");
	const txClaim = new Transaction();
	txClaim.moveCall({
		target: `${PACKAGE_ID}::shadowbook::claim_payout`,
		arguments: [txClaim.object(roundId), txClaim.object(CLOCK)],
	});

	const claimDigest = await signAndExecute(txClaim, keypair);
	console.log(`✅ claim_payout tx: ${claimDigest}`);

	// Final verification
	const roundFinal = await client.getObject({
		id: roundId,
		options: { showContent: true },
	});
	const fieldsFinal = (roundFinal.data?.content as any)?.fields;
	console.log(`\n━━━ FINAL STATE ━━━`);
	console.log(`Status: ${fieldsFinal?.status} (3 = Settled)`);
	console.log(`Outcome: ${fieldsFinal?.actual_outcome}`);
	console.log(`Remaining escrow: ${fieldsFinal?.escrow} MIST`);
	console.log(`Revealed orders remaining: ${fieldsFinal?.revealed_orders?.length}`);

	console.log("\n✅ E2E TEST COMPLETE — All 5 steps passed on testnet!\n");
}

main().catch((err) => {
	console.error("\n❌ E2E TEST FAILED:", err.message);
	process.exit(1);
});

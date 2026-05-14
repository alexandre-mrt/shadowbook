import {
	EncryptedObject,
	NoAccessError,
	SealClient,
	SessionKey,
	getAllowlistedKeyServers,
} from "@mysten/seal";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";

import { CLOCK_ID, NETWORK } from "@/lib/constants";
import { encodeSealId, sealIdToHex } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncryptOrderParams {
	sealClient: SealClient;
	sealPolicyPackageId: string;
	/** commit_deadline_ms used as SEAL time-lock identity (BCS u64 LE) */
	commitDeadlineMs: bigint;
	/** BCS-serialized order bytes */
	orderData: Uint8Array;
}

export interface DecryptOrderParams {
	sealClient: SealClient;
	sealPolicyPackageId: string;
	encryptedData: Uint8Array;
	sessionKey: SessionKey;
}

export interface CreateSessionKeyParams {
	address: string;
	packageId: string;
	ttlMin?: number;
}

// ---------------------------------------------------------------------------
// SealClient factory
// ---------------------------------------------------------------------------

/**
 * Create a SealClient using the allowlisted key servers for the configured network.
 *
 * NIGHT-SHIFT-REVIEW: SealClient declares @mysten/sui v1 SuiClient but project uses v2
 * ClientWithCoreApi. At runtime both implement getObject; cast is safe.
 */
export function createSealClient(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	suiClient: ClientWithCoreApi,
): SealClient {
	const serverObjectIds = getAllowlistedKeyServers(NETWORK);
	return new SealClient({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		suiClient: suiClient as any,
		serverObjectIds,
		verifyKeyServers: false,
	});
}

// ---------------------------------------------------------------------------
// Encrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt order data using SEAL time-lock encryption.
 *
 * The SEAL identity is the BCS-encoded commit_deadline_ms (u64 LE, 8 bytes),
 * matching what seal_policy::seal_approve expects via bcs::peel_u64.
 */
export async function encryptOrder(params: EncryptOrderParams): Promise<Uint8Array> {
	const { sealClient, sealPolicyPackageId, commitDeadlineMs, orderData } = params;

	const sealIdHex = sealIdToHex(encodeSealId(commitDeadlineMs));

	const { encryptedObject } = await sealClient.encrypt({
		threshold: 2,
		packageId: sealPolicyPackageId,
		id: sealIdHex,
		data: orderData,
	});

	return encryptedObject;
}

// ---------------------------------------------------------------------------
// Decrypt
// ---------------------------------------------------------------------------

/**
 * Decrypt order data using SEAL after the time-lock has expired.
 *
 * Builds a TransactionKind calling seal_policy::seal_approve(id, Clock),
 * fetches decryption keys, then decrypts.
 *
 * Throws NoAccessError if the time-lock has not yet expired.
 */
export async function decryptOrder(params: DecryptOrderParams): Promise<Uint8Array> {
	const { sealClient, sealPolicyPackageId, encryptedData, sessionKey } = params;

	const encObj = EncryptedObject.parse(encryptedData);

	const tx = new Transaction();
	tx.moveCall({
		target: `${sealPolicyPackageId}::seal_policy::seal_approve`,
		arguments: [tx.pure.vector("u8", Array.from(fromHex(encObj.id))), tx.object(CLOCK_ID)],
	});

	const txBytes = await tx.build({ onlyTransactionKind: true });

	await sealClient.fetchKeys({
		ids: [encObj.id],
		txBytes,
		sessionKey,
		threshold: 1,
	});

	return sealClient.decrypt({ data: encryptedData, sessionKey, txBytes });
}

// ---------------------------------------------------------------------------
// SessionKey factory
// ---------------------------------------------------------------------------

/**
 * Create a new SessionKey for a given address and package.
 *
 * Caller must:
 * 1. Get the personal message via sessionKey.getPersonalMessage()
 * 2. Sign it with the wallet
 * 3. Call sessionKey.setPersonalMessageSignature(signature)
 * Then pass the sessionKey to decryptOrder.
 */
export function createSessionKey(params: CreateSessionKeyParams): SessionKey {
	const { address, packageId, ttlMin = 10 } = params;
	return new SessionKey({ address, packageId, ttlMin });
}

// Re-export errors for callers
export { NoAccessError, SealClient, SessionKey };

import { bcs } from "@mysten/sui/bcs";
import { fromHex, toHex } from "@mysten/sui/utils";
import { keccak_256 } from "@noble/hashes/sha3";

/**
 * Convert a bigint to a little-endian Uint8Array of `bytes` length.
 * Throws if the value doesn't fit.
 */
export function numberToLE(n: bigint, bytes: number): Uint8Array {
	if (n < 0n) throw new Error("numberToLE: negative values not supported");
	const result = new Uint8Array(bytes);
	let remaining = n;
	for (let i = 0; i < bytes; i++) {
		result[i] = Number(remaining & 0xffn);
		remaining >>= 8n;
	}
	if (remaining !== 0n) {
		throw new Error(`numberToLE: value ${n} does not fit in ${bytes} bytes`);
	}
	return result;
}

/**
 * Generate 32 random bytes for use as a salt.
 */
export function generateSalt(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * BCS-serialize the order for SEAL encryption.
 * Layout: [is_up as u8] ++ [amount as u64 LE] ++ salt
 */
export function serializeOrder(isUp: boolean, amount: bigint, salt: Uint8Array): Uint8Array {
	const isUpByte = new Uint8Array([isUp ? 1 : 0]);
	const amountBytes = bcs.U64.serialize(amount).toBytes();
	const result = new Uint8Array(isUpByte.length + amountBytes.length + salt.length);
	result.set(isUpByte, 0);
	result.set(amountBytes, isUpByte.length);
	result.set(salt, isUpByte.length + amountBytes.length);
	return result;
}

/**
 * Compute the keccak256 order hash matching the Move contract's computation.
 *
 * Hash input: [is_up as u8] ++ [amount as 8 bytes LE] ++ salt ++ address_bytes
 *
 * Uses sui::address::to_bytes(sender) = fromHex(senderAddress) — NOT bcs::to_bytes(&sender).
 */
export function computeOrderHash(
	isUp: boolean,
	amount: bigint,
	salt: Uint8Array,
	senderAddress: string,
): Uint8Array {
	const isUpByte = new Uint8Array([isUp ? 1 : 0]);
	const amountBytes = numberToLE(amount, 8);
	const addrBytes = fromHex(
		senderAddress.startsWith("0x") ? senderAddress.slice(2) : senderAddress,
	);

	const data = new Uint8Array(
		isUpByte.length + amountBytes.length + salt.length + addrBytes.length,
	);
	let offset = 0;
	data.set(isUpByte, offset);
	offset += isUpByte.length;
	data.set(amountBytes, offset);
	offset += amountBytes.length;
	data.set(salt, offset);
	offset += salt.length;
	data.set(addrBytes, offset);

	return keccak_256(data);
}

/**
 * Encode a bigint as BCS u64 bytes (little-endian, 8 bytes).
 * Used to build the SEAL identity from commit_deadline_ms.
 */
export function encodeSealId(commitDeadlineMs: bigint): Uint8Array {
	return bcs.U64.serialize(commitDeadlineMs).toBytes();
}

/**
 * Convert a SEAL identity (BCS u64 bytes) to the hex string required by SealClient.encrypt.
 */
export function sealIdToHex(sealIdBytes: Uint8Array): string {
	return toHex(sealIdBytes);
}

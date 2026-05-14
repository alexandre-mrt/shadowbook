"use client";

import { CLOCK_ID, SHADOWBOOK_PACKAGE_ID } from "@/lib/constants";
import { SEAL_POLICY_PACKAGE_ID } from "@/lib/constants";
import { NoAccessError, createSealClient, createSessionKey, decryptOrder } from "@/lib/seal";
import { suiClient } from "@/lib/sui-client";
import { fetchEncryptedOrder } from "@/lib/walrus";
import type { SessionKey } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { useCallback, useState } from "react";

interface SavedOrder {
	isUp: boolean;
	amount: string;
	salt: string;
	blobId: string;
}

interface RevealResult {
	transaction: Transaction;
	isUp: boolean;
	amount: bigint;
	salt: Uint8Array;
}

interface UseSealDecryptResult {
	decryptAndReveal: (
		roundId: string,
		senderAddress: string,
		signPersonalMessage: (message: Uint8Array) => Promise<{ signature: string }>,
	) => Promise<RevealResult>;
	isDecrypting: boolean;
	error: string | null;
}

const STORAGE_PREFIX = "shadowbook_order_";

function loadOrderFromStorage(roundId: string, address: string): SavedOrder | null {
	const key = `${STORAGE_PREFIX}${roundId}_${address}`;
	const raw = localStorage.getItem(key);
	if (!raw) return null;
	return JSON.parse(raw) as SavedOrder;
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

export function useSealDecrypt(): UseSealDecryptResult {
	const [isDecrypting, setIsDecrypting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const decryptAndReveal = useCallback(
		async (
			roundId: string,
			senderAddress: string,
			signPersonalMessage: (message: Uint8Array) => Promise<{ signature: string }>,
		): Promise<RevealResult> => {
			setIsDecrypting(true);
			setError(null);

			try {
				const saved = loadOrderFromStorage(roundId, senderAddress);
				if (!saved) throw new Error("No saved order found for this round");

				const encryptedData = await fetchEncryptedOrder(saved.blobId);

				const sessionKey: SessionKey = createSessionKey({
					address: senderAddress,
					packageId: SEAL_POLICY_PACKAGE_ID,
				});

				const personalMessage = sessionKey.getPersonalMessage();
				const { signature } = await signPersonalMessage(personalMessage);
				sessionKey.setPersonalMessageSignature(signature);

				const sealClient = createSealClient(suiClient);
				await decryptOrder({
					sealClient,
					sealPolicyPackageId: SEAL_POLICY_PACKAGE_ID,
					encryptedData,
					sessionKey,
				});

				const salt = hexToBytes(saved.salt);
				const amount = BigInt(saved.amount);
				const isUp = saved.isUp;

				const tx = new Transaction();
				tx.moveCall({
					target: `${SHADOWBOOK_PACKAGE_ID}::shadowbook::reveal_order`,
					arguments: [
						tx.object(roundId),
						tx.pure.bool(isUp),
						tx.pure.u64(amount),
						tx.pure.vector("u8", Array.from(salt)),
						tx.object(CLOCK_ID),
					],
				});

				return { transaction: tx, isUp, amount, salt };
			} catch (err) {
				const message =
					err instanceof NoAccessError
						? "Time-lock has not expired yet — cannot decrypt"
						: err instanceof Error
							? err.message
							: "Decryption failed";
				setError(message);
				throw err;
			} finally {
				setIsDecrypting(false);
			}
		},
		[],
	);

	return { decryptAndReveal, isDecrypting, error };
}

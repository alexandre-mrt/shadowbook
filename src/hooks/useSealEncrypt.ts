"use client";

import { CLOCK_ID, SEAL_POLICY_PACKAGE_ID, SHADOWBOOK_PACKAGE_ID } from "@/lib/constants";
import { computeOrderHash, generateSalt, serializeOrder } from "@/lib/crypto";
import { createSealClient, encryptOrder } from "@/lib/seal";
import { suiClient } from "@/lib/sui-client";
import { storeEncryptedOrder } from "@/lib/walrus";
import { Transaction } from "@mysten/sui/transactions";
import { useCallback, useState } from "react";

interface CommitResult {
	transaction: Transaction;
	salt: Uint8Array;
	blobId: string;
	orderHash: Uint8Array;
}

interface UseSealEncryptResult {
	encryptAndCommit: (
		roundId: string,
		commitDeadlineMs: bigint,
		isUp: boolean,
		amountMist: bigint,
		senderAddress: string,
	) => Promise<CommitResult>;
	isEncrypting: boolean;
	error: string | null;
}

const STORAGE_PREFIX = "shadowbook_order_";

function saveOrderToStorage(
	roundId: string,
	address: string,
	data: {
		isUp: boolean;
		amount: string;
		salt: string;
		blobId: string;
	},
) {
	const key = `${STORAGE_PREFIX}${roundId}_${address}`;
	localStorage.setItem(key, JSON.stringify(data));
}

export function useSealEncrypt(): UseSealEncryptResult {
	const [isEncrypting, setIsEncrypting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const encryptAndCommit = useCallback(
		async (
			roundId: string,
			commitDeadlineMs: bigint,
			isUp: boolean,
			amountMist: bigint,
			senderAddress: string,
		): Promise<CommitResult> => {
			setIsEncrypting(true);
			setError(null);

			try {
				const salt = generateSalt();

				const orderData = serializeOrder(isUp, amountMist, salt);

				const sealClient = createSealClient(suiClient);
				const encrypted = await encryptOrder({
					sealClient,
					sealPolicyPackageId: SEAL_POLICY_PACKAGE_ID,
					commitDeadlineMs,
					orderData,
				});

				const blobId = await storeEncryptedOrder(encrypted);

				const orderHash = computeOrderHash(isUp, amountMist, salt, senderAddress);

				const tx = new Transaction();
				tx.moveCall({
					target: `${SHADOWBOOK_PACKAGE_ID}::shadowbook::commit_order`,
					arguments: [
						tx.object(roundId),
						tx.pure.vector("u8", Array.from(orderHash)),
						tx.pure.vector("u8", Array.from(new TextEncoder().encode(blobId))),
						tx.splitCoins(tx.gas, [amountMist]),
						tx.object(CLOCK_ID),
					],
				});

				saveOrderToStorage(roundId, senderAddress, {
					isUp,
					amount: amountMist.toString(),
					salt: Array.from(salt)
						.map((b) => b.toString(16).padStart(2, "0"))
						.join(""),
					blobId,
				});

				return { transaction: tx, salt, blobId, orderHash };
			} catch (err) {
				const message = err instanceof Error ? err.message : "Encryption failed";
				setError(message);
				throw err;
			} finally {
				setIsEncrypting(false);
			}
		},
		[],
	);

	return { encryptAndCommit, isEncrypting, error };
}

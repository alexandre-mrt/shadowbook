// NIGHT-SHIFT-REVIEW: SuiJsonRpcClient is the v2 JSON-RPC client from @mysten/sui
// No SuiClient export exists — confirmed from source code inspection

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import {
	NETWORK,
	SHADOWBOOK_PACKAGE_ID,
	// TODO: wire up SEAL_POLICY_PACKAGE_ID when deploying
} from "./constants";

export type RoundStatus = "Open" | "Reveal" | "Execute" | "Settled" | "Cancelled";

export interface Commitment {
	trader: string;
	orderHash: string;
	walrusBlobId: string;
	timestampMs: number;
}

export interface RevealedOrder {
	trader: string;
	isUp: boolean;
	amount: bigint;
}

export interface Round {
	id: string;
	oracleId: string;
	expiryMs: number;
	strike: number;
	commitDeadlineMs: number;
	revealDeadlineMs: number;
	commitmentCount: number;
	revealedOrders: RevealedOrder[];
	status: RoundStatus;
	escrowAmount: bigint;
}

export interface RoundResult {
	roundId: string;
	outcome: "UP" | "DOWN" | null;
	winners: string[];
	payouts: Record<string, bigint>;
	totalUp: bigint;
	totalDown: bigint;
}

// Shared client instance
export const suiClient = new SuiJsonRpcClient({
	url: getJsonRpcFullnodeUrl(NETWORK),
	network: NETWORK,
});

const ROUND_TYPE = `${SHADOWBOOK_PACKAGE_ID}::shadowbook::Round`;

/**
 * Fetch all Round shared objects from the chain.
 * TODO: Package ID is empty until contracts are deployed — returns mock data.
 * @returns Array of Round objects
 */
export async function fetchRounds(): Promise<Round[]> {
	// NIGHT-SHIFT-REVIEW: Without a deployed package ID, we cannot query objects by type.
	// Returning mock data until SHADOWBOOK_PACKAGE_ID is set.
	if (!SHADOWBOOK_PACKAGE_ID) {
		return getMockRounds();
	}

	// When deployed, query events of type RoundCreated to find all round IDs
	// then fetch objects by ID using suiClient.core.getObjects(...)
	// This pattern avoids the need for an indexer.
	// See: ARCHITECTURE.md for event types
	try {
		// queryEvents is directly on SuiJsonRpcClient (not .core)
		const events = await suiClient.queryEvents({
			query: { MoveEventType: `${SHADOWBOOK_PACKAGE_ID}::shadowbook::RoundCreated` },
			limit: 50,
		});

		const roundIds = events.data
			.map((e) => {
				const parsed = e.parsedJson as { round_id?: string };
				return parsed?.round_id;
			})
			.filter((id): id is string => typeof id === "string");

		if (roundIds.length === 0) return [];

		// getObjects is on .core (JSONRpcCoreClient)
		const { objects } = await suiClient.core.getObjects({
			objectIds: roundIds,
			include: { json: true },
		});

		return objects
			.filter((obj): obj is Exclude<typeof obj, Error> => !(obj instanceof Error))
			.map(mapObjectToRound)
			.filter((r): r is Round => r !== null);
	} catch {
		return getMockRounds();
	}
}

/**
 * Fetch a single Round by object ID.
 * TODO: Returns mock data if package not deployed.
 */
export async function fetchRoundById(id: string): Promise<Round | null> {
	if (!SHADOWBOOK_PACKAGE_ID) {
		return getMockRounds().find((r) => r.id === id) ?? null;
	}

	try {
		const { object } = await suiClient.core.getObject({
			objectId: id,
			include: { json: true },
		});

		if (!object) return null;
		if (object.type !== ROUND_TYPE) return null;

		return mapObjectToRound(object);
	} catch {
		return null;
	}
}

function mapObjectToRound(obj: {
	objectId: string;
	type: string;
	json?: Record<string, unknown> | null;
}): Round | null {
	const json = obj.json;
	if (!json) return null;

	return {
		id: obj.objectId,
		oracleId: String(json.oracle_id ?? ""),
		expiryMs: Number(json.expiry_ms ?? 0),
		strike: Number(json.strike ?? 0),
		commitDeadlineMs: Number(json.commit_deadline_ms ?? 0),
		revealDeadlineMs: Number(json.reveal_deadline_ms ?? 0),
		commitmentCount: Number(json.commitment_count ?? 0),
		revealedOrders: [],
		status: parseRoundStatus(json.status),
		escrowAmount: BigInt(0),
	};
}

function parseRoundStatus(raw: unknown): RoundStatus {
	if (typeof raw === "string") {
		const map: Record<string, RoundStatus> = {
			Open: "Open",
			Reveal: "Reveal",
			Execute: "Execute",
			Settled: "Settled",
			Cancelled: "Cancelled",
		};
		return map[raw] ?? "Open";
	}
	// Move enums can come as objects: { variant: "Open" }
	if (typeof raw === "object" && raw !== null && "variant" in raw) {
		return parseRoundStatus((raw as { variant: unknown }).variant);
	}
	return "Open";
}

// Mock data — structures match Move contract exactly
function getMockRounds(): Round[] {
	const now = Date.now();
	return [
		{
			id: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
			oracleId: "btc_usd",
			expiryMs: now + 7 * 24 * 60 * 60 * 1000,
			strike: 105_000,
			commitDeadlineMs: now + 15 * 60 * 1000,
			revealDeadlineMs: now + 20 * 60 * 1000,
			commitmentCount: 3,
			revealedOrders: [],
			status: "Open",
			escrowAmount: BigInt(45_200_000_000),
		},
		{
			id: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c",
			oracleId: "eth_usd",
			expiryMs: now + 3 * 24 * 60 * 60 * 1000,
			strike: 3_800,
			commitDeadlineMs: now - 5 * 60 * 1000,
			revealDeadlineMs: now + 2 * 60 * 1000 + 15 * 1000,
			commitmentCount: 7,
			revealedOrders: [],
			status: "Reveal",
			escrowAmount: BigInt(128_000_000_000),
		},
		{
			id: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
			oracleId: "sol_usd",
			expiryMs: now - 2 * 24 * 60 * 60 * 1000,
			strike: 180,
			commitDeadlineMs: now - 3 * 60 * 60 * 1000,
			revealDeadlineMs: now - 2 * 60 * 60 * 1000,
			commitmentCount: 12,
			revealedOrders: [
				{ trader: "0xabc", isUp: true, amount: BigInt(10_000_000_000) },
				{ trader: "0xdef", isUp: false, amount: BigInt(5_000_000_000) },
			],
			status: "Settled",
			escrowAmount: BigInt(210_000_000_000),
		},
	];
}

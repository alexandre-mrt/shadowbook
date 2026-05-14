import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { NETWORK, SHADOWBOOK_PACKAGE_ID } from "./constants";

export type RoundStatus = "Open" | "Reveal" | "Execute" | "Settled" | "Cancelled";

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
	actualOutcome: boolean | null;
}

export const suiClient = new SuiJsonRpcClient({
	url: getJsonRpcFullnodeUrl(NETWORK),
	network: NETWORK,
});

const STATUS_MAP: Record<number, RoundStatus> = {
	0: "Open",
	1: "Reveal",
	2: "Execute",
	3: "Settled",
	4: "Cancelled",
};

function computeLiveStatus(
	status: number,
	commitDeadlineMs: number,
	revealDeadlineMs: number,
): RoundStatus {
	const now = Date.now();
	if (status === 0 && now >= commitDeadlineMs) return "Reveal";
	if (status <= 1 && now >= revealDeadlineMs) return "Execute";
	return STATUS_MAP[status] ?? "Open";
}

// biome-ignore lint: complex json parsing
function parseRoundFields(objectId: string, fields: any): Round {
	const commitDeadlineMs = Number(fields.commit_deadline_ms);
	const revealDeadlineMs = Number(fields.reveal_deadline_ms);
	const rawStatus = typeof fields.status === "number" ? fields.status : 0;

	const revealedOrders: RevealedOrder[] = (fields.revealed_orders ?? []).map(
		// biome-ignore lint: json parsing
		(o: any) => ({
			trader: String(o.fields?.trader ?? o.trader ?? ""),
			isUp: Boolean(o.fields?.is_up ?? o.is_up),
			amount: BigInt(o.fields?.amount ?? o.amount ?? 0),
		}),
	);

	return {
		id: objectId,
		oracleId: String(fields.oracle_id ?? ""),
		expiryMs: Number(fields.expiry_ms ?? 0),
		strike: Number(fields.strike ?? 0),
		commitDeadlineMs,
		revealDeadlineMs,
		commitmentCount: Number(fields.commitments?.fields?.size ?? 0),
		revealedOrders,
		status: computeLiveStatus(rawStatus, commitDeadlineMs, revealDeadlineMs),
		escrowAmount: BigInt(fields.total_escrowed ?? 0),
		actualOutcome: fields.actual_outcome ?? null,
	};
}

export async function fetchRounds(): Promise<Round[]> {
	if (!SHADOWBOOK_PACKAGE_ID) return [];

	try {
		const events = await suiClient.queryEvents({
			query: { MoveEventType: `${SHADOWBOOK_PACKAGE_ID}::shadowbook::RoundCreated` },
			limit: 50,
			order: "descending",
		});

		const roundIds = events.data
			.map((e) => {
				const parsed = e.parsedJson as Record<string, string>;
				return parsed?.round_id;
			})
			.filter((id): id is string => typeof id === "string");

		if (roundIds.length === 0) return [];

		const objects = await suiClient.multiGetObjects({
			ids: roundIds,
			options: { showContent: true },
		});

		return objects
			.filter((obj) => obj.data?.content?.dataType === "moveObject")
			.map((obj) => {
				// biome-ignore lint: json parsing
				const fields = (obj.data!.content as any).fields;
				return parseRoundFields(obj.data!.objectId, fields);
			});
	} catch (err) {
		console.error("fetchRounds failed:", err);
		return [];
	}
}

export async function fetchRoundById(id: string): Promise<Round | null> {
	if (!SHADOWBOOK_PACKAGE_ID) return null;

	try {
		const result = await suiClient.getObject({
			id,
			options: { showContent: true },
		});

		if (!result.data?.content || result.data.content.dataType !== "moveObject") return null;

		// biome-ignore lint: json parsing
		const fields = (result.data.content as any).fields;
		return parseRoundFields(result.data.objectId, fields);
	} catch {
		return null;
	}
}

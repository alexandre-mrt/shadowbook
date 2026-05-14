"use client";

import type { RevealedOrder } from "@/lib/sui-client";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface ResultsPanelProps {
	outcome: "UP" | "DOWN" | null;
	revealedOrders: RevealedOrder[];
	userAddress?: string;
	onClaim?: () => void;
	claimable: boolean;
}

function formatSui(mist: bigint): string {
	const sui = Number(mist) / 1_000_000_000;
	return `${sui.toFixed(2)} SUI`;
}

export function ResultsPanel({
	outcome,
	revealedOrders,
	userAddress,
	onClaim,
	claimable,
}: ResultsPanelProps) {
	const totalUp = revealedOrders
		.filter((o) => o.isUp)
		.reduce((sum, o) => sum + o.amount, BigInt(0));
	const totalDown = revealedOrders
		.filter((o) => !o.isUp)
		.reduce((sum, o) => sum + o.amount, BigInt(0));

	const userOrder = revealedOrders.find((o) => o.trader === userAddress);
	const userWon = userOrder ? (userOrder.isUp ? outcome === "UP" : outcome === "DOWN") : false;

	return (
		<div style={{ padding: "1.5rem 0" }}>
			<div
				style={{
					fontFamily: MONO,
					fontSize: "0.7rem",
					color: "#555",
					letterSpacing: "0.15em",
					marginBottom: "1rem",
					textTransform: "uppercase",
				}}
			>
				Results
			</div>

			{outcome && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.75rem",
						padding: "1rem",
						border: `1px solid ${outcome === "UP" ? "#00FF41" : "#FF4444"}`,
						borderRadius: "4px",
						backgroundColor: outcome === "UP" ? "rgba(0,255,65,0.06)" : "rgba(255,68,68,0.06)",
						marginBottom: "1rem",
					}}
				>
					<span
						style={{
							fontFamily: MONO,
							fontSize: "1.5rem",
							color: outcome === "UP" ? "#00FF41" : "#FF4444",
						}}
					>
						{outcome === "UP" ? "▲" : "▼"}
					</span>
					<div>
						<div
							style={{
								fontFamily: MONO,
								fontSize: "0.85rem",
								fontWeight: 700,
								color: "#fff",
							}}
						>
							Outcome: {outcome}
						</div>
						<div style={{ fontFamily: MONO, fontSize: "0.7rem", color: "#888" }}>
							UP: {formatSui(totalUp)} — DOWN: {formatSui(totalDown)}
						</div>
					</div>
				</div>
			)}

			{userOrder && (
				<div
					style={{
						padding: "0.75rem",
						border: `1px solid ${userWon ? "#00FF41" : "#FF4444"}`,
						borderRadius: "4px",
						backgroundColor: userWon ? "rgba(0,255,65,0.04)" : "rgba(255,68,68,0.04)",
						marginBottom: "1rem",
						fontFamily: MONO,
						fontSize: "0.8rem",
					}}
				>
					<div style={{ color: userWon ? "#00FF41" : "#FF4444", fontWeight: 600 }}>
						{userWon ? "You won!" : "You lost"}
					</div>
					<div style={{ color: "#888", fontSize: "0.7rem", marginTop: "0.25rem" }}>
						Your bet: {userOrder.isUp ? "UP" : "DOWN"} — {formatSui(userOrder.amount)}
					</div>
				</div>
			)}

			{claimable && onClaim && (
				<button
					type="button"
					onClick={onClaim}
					style={{
						width: "100%",
						padding: "0.85rem",
						border: "none",
						borderRadius: "4px",
						backgroundColor: "#00FF41",
						color: "#0A0A0A",
						fontFamily: MONO,
						fontSize: "0.85rem",
						fontWeight: 700,
						letterSpacing: "0.1em",
						cursor: "pointer",
						transition: "all 0.15s",
					}}
				>
					CLAIM PAYOUT
				</button>
			)}

			<div style={{ marginTop: "1.25rem" }}>
				<div
					style={{
						fontFamily: MONO,
						fontSize: "0.65rem",
						color: "#444",
						letterSpacing: "0.1em",
						marginBottom: "0.5rem",
					}}
				>
					REVEALED ORDERS ({revealedOrders.length})
				</div>
				{revealedOrders.map((order) => (
					<div
						key={order.trader}
						style={{
							display: "flex",
							justifyContent: "space-between",
							padding: "0.4rem 0",
							borderBottom: "1px solid #111",
							fontFamily: MONO,
							fontSize: "0.7rem",
						}}
					>
						<span style={{ color: "#555" }}>
							{order.trader.slice(0, 6)}...{order.trader.slice(-4)}
						</span>
						<span style={{ color: order.isUp ? "#00FF41" : "#FF4444" }}>
							{order.isUp ? "▲ UP" : "▼ DOWN"}
						</span>
						<span style={{ color: "#888" }}>{formatSui(order.amount)}</span>
					</div>
				))}
			</div>
		</div>
	);
}

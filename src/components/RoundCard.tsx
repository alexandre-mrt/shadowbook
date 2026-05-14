"use client";

import type { Round } from "@/lib/sui-client";
import Link from "next/link";

const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
	Open: { color: "#00FF41", bg: "rgba(0,255,65,0.08)" },
	Reveal: { color: "#FFD700", bg: "rgba(255,215,0,0.08)" },
	Execute: { color: "#4DA6FF", bg: "rgba(77,166,255,0.08)" },
	Settled: { color: "#666", bg: "rgba(102,102,102,0.08)" },
	Cancelled: { color: "#FF4444", bg: "rgba(255,68,68,0.08)" },
};

function formatTimeRemaining(deadlineMs: number): string {
	const diff = deadlineMs - Date.now();
	if (diff <= 0) return "expired";
	const mins = Math.floor(diff / 60_000);
	const secs = Math.floor((diff % 60_000) / 1000);
	if (mins >= 60) {
		const hrs = Math.floor(mins / 60);
		return `${hrs}h ${mins % 60}m`;
	}
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatSui(mist: bigint): string {
	const sui = Number(mist) / 1_000_000_000;
	return `${sui.toFixed(1)} SUI`;
}

function oracleLabel(oracleId: string): string {
	const map: Record<string, string> = {
		btc_usd: "BTC/USD",
		eth_usd: "ETH/USD",
		sol_usd: "SOL/USD",
	};
	return map[oracleId] ?? oracleId.slice(0, 8);
}

export function RoundCard({ round }: { round: Round }) {
	const style = STATUS_STYLES[round.status] ?? STATUS_STYLES.Open;
	const deadline = round.status === "Open" ? round.commitDeadlineMs : round.revealDeadlineMs;

	return (
		<Link href={`/round/${round.id}`} style={{ textDecoration: "none", color: "inherit" }}>
			<div
				style={{
					border: "1px solid #1a1a1a",
					borderRadius: "4px",
					padding: "1.25rem",
					backgroundColor: "#0f0f0f",
					cursor: "pointer",
					transition: "border-color 0.15s",
				}}
				onMouseEnter={(e) => {
					e.currentTarget.style.borderColor = style.color;
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.borderColor = "#1a1a1a";
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: "0.75rem",
					}}
				>
					<span
						style={{
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "0.95rem",
							fontWeight: 600,
							color: "#fff",
						}}
					>
						{oracleLabel(round.oracleId)} &gt; ${round.strike.toLocaleString()}
					</span>
					<span
						style={{
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "0.65rem",
							fontWeight: 600,
							letterSpacing: "0.1em",
							color: style.color,
							backgroundColor: style.bg,
							padding: "0.15rem 0.5rem",
							borderRadius: "2px",
						}}
					>
						● {round.status.toUpperCase()}
					</span>
				</div>

				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "0.75rem",
						color: "#777",
					}}
				>
					<span>{round.status === "Settled" ? "Finished" : formatTimeRemaining(deadline)}</span>
					<span>{formatSui(round.escrowAmount)} escrowed</span>
				</div>

				<div
					style={{
						marginTop: "0.5rem",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "0.7rem",
						color: "#555",
					}}
				>
					{round.commitmentCount} commitment{round.commitmentCount !== 1 ? "s" : ""}
				</div>
			</div>
		</Link>
	);
}

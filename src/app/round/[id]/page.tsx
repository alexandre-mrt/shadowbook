"use client";

import { CommitForm } from "@/components/CommitForm";
import { ResultsPanel } from "@/components/ResultsPanel";
import { RevealButton } from "@/components/RevealButton";
import { useRoundDetail } from "@/hooks/useRoundDetail";
import Link from "next/link";
import { use } from "react";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function formatDeadline(ms: number): string {
	return new Date(ms).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
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

function TimeDisplay({
	label,
	hours,
	minutes,
	seconds,
}: { label: string; hours: number; minutes: number; seconds: number }) {
	return (
		<div style={{ textAlign: "center", padding: "1rem 0" }}>
			<div
				style={{
					fontFamily: MONO,
					fontSize: "0.65rem",
					color: "#555",
					letterSpacing: "0.15em",
					marginBottom: "0.5rem",
				}}
			>
				{label.toUpperCase()}
			</div>
			<div
				style={{
					fontFamily: MONO,
					fontSize: "2rem",
					fontWeight: 700,
					color: "#00FF41",
					fontVariantNumeric: "tabular-nums",
				}}
			>
				{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
				{String(seconds).padStart(2, "0")}
			</div>
		</div>
	);
}

export default function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	const { round, isLoading, timeRemaining } = useRoundDetail(id);

	if (isLoading) {
		return (
			<div
				style={{
					fontFamily: MONO,
					fontSize: "0.8rem",
					color: "#555",
					padding: "3rem 0",
					textAlign: "center",
				}}
			>
				Loading round...
			</div>
		);
	}

	if (!round) {
		return (
			<div
				style={{
					fontFamily: MONO,
					fontSize: "0.8rem",
					color: "#FF4444",
					padding: "3rem 0",
					textAlign: "center",
				}}
			>
				Round not found
			</div>
		);
	}

	const statusColors: Record<string, string> = {
		Open: "#00FF41",
		Reveal: "#FFD700",
		Execute: "#4DA6FF",
		Settled: "#666",
		Cancelled: "#FF4444",
	};

	return (
		<div style={{ maxWidth: "40rem", margin: "0 auto" }}>
			{/* Back + Header */}
			<div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
				<Link
					href="/"
					style={{ fontFamily: MONO, fontSize: "0.8rem", color: "#555", textDecoration: "none" }}
				>
					← Back
				</Link>
				<span style={{ fontFamily: MONO, fontSize: "0.65rem", color: "#333" }}>
					{round.id.slice(0, 10)}...
				</span>
				<span
					style={{
						fontFamily: MONO,
						fontSize: "0.65rem",
						fontWeight: 600,
						letterSpacing: "0.1em",
						color: statusColors[round.status] ?? "#666",
						marginLeft: "auto",
					}}
				>
					● {round.status.toUpperCase()}
				</span>
			</div>

			{/* Round Info */}
			<div
				style={{
					border: "1px solid #1a1a1a",
					borderRadius: "4px",
					padding: "1rem 1.25rem",
					backgroundColor: "#0f0f0f",
					marginBottom: "1rem",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "baseline",
						marginBottom: "0.75rem",
					}}
				>
					<span style={{ fontFamily: MONO, fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>
						{oracleLabel(round.oracleId)} &gt; ${round.strike.toLocaleString()}
					</span>
					<span style={{ fontFamily: MONO, fontSize: "0.75rem", color: "#888" }}>
						{formatSui(round.escrowAmount)} escrowed
					</span>
				</div>

				<div
					style={{
						display: "flex",
						gap: "2rem",
						fontFamily: MONO,
						fontSize: "0.7rem",
						color: "#555",
					}}
				>
					<span>Commit: {formatDeadline(round.commitDeadlineMs)}</span>
					<span>Reveal: {formatDeadline(round.revealDeadlineMs)}</span>
					<span>{round.commitmentCount} committed</span>
				</div>
			</div>

			{/* Countdown */}
			{timeRemaining && timeRemaining.totalMs > 0 && (
				<TimeDisplay
					label={timeRemaining.label}
					hours={timeRemaining.hours}
					minutes={timeRemaining.minutes}
					seconds={timeRemaining.seconds}
				/>
			)}

			{/* Phase-specific UI */}
			<div
				style={{
					border: "1px solid #1a1a1a",
					borderRadius: "4px",
					padding: "0 1.25rem",
					backgroundColor: "#0f0f0f",
				}}
			>
				{round.status === "Open" && (
					<CommitForm
						roundId={round.id}
						onCommit={(params) => {
							console.log("Commit:", params);
						}}
					/>
				)}

				{round.status === "Reveal" && (
					<RevealButton
						roundId={round.id}
						onReveal={() => {
							console.log("Reveal triggered");
						}}
					/>
				)}

				{(round.status === "Settled" || round.status === "Execute") && (
					<ResultsPanel
						outcome={round.status === "Settled" ? "UP" : null}
						revealedOrders={round.revealedOrders}
						claimable={round.status === "Settled"}
						onClaim={() => {
							console.log("Claim payout");
						}}
					/>
				)}

				{round.status === "Cancelled" && (
					<div
						style={{
							padding: "1.5rem 0",
							fontFamily: MONO,
							fontSize: "0.8rem",
							color: "#FF4444",
							textAlign: "center",
						}}
					>
						This round was cancelled. Funds have been refunded.
					</div>
				)}
			</div>
		</div>
	);
}

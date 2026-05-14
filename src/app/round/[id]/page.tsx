"use client";

import { CommitForm } from "@/components/CommitForm";
import { ResultsPanel } from "@/components/ResultsPanel";
import { RevealButton } from "@/components/RevealButton";
import { useRoundDetail } from "@/hooks/useRoundDetail";
import { useSealDecrypt } from "@/hooks/useSealDecrypt";
import { useSealEncrypt } from "@/hooks/useSealEncrypt";
import { CLOCK_ID, SHADOWBOOK_PACKAGE_ID } from "@/lib/constants";
import { suiClient } from "@/lib/sui-client";
import { CurrentAccountSigner } from "@mysten/dapp-kit-core";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import Link from "next/link";
import { use, useCallback, useState } from "react";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MIST_PER_SUI = 1_000_000_000n;

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
	if (oracleId.length > 16) return oracleId.slice(0, 8) + "...";
	const map: Record<string, string> = {
		btc_usd: "BTC/USD",
		eth_usd: "ETH/USD",
		sol_usd: "SOL/USD",
	};
	return map[oracleId] ?? "ORACLE";
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

function StatusMessage({ text, color }: { text: string; color: string }) {
	return (
		<div
			style={{
				fontFamily: MONO,
				fontSize: "0.75rem",
				color,
				padding: "0.75rem",
				border: `1px solid ${color}33`,
				borderRadius: "4px",
				backgroundColor: `${color}08`,
				marginBottom: "1rem",
				textAlign: "center",
			}}
		>
			{text}
		</div>
	);
}

export default function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	const { round, isLoading, timeRemaining, refetch } = useRoundDetail(id);
	const { encryptAndCommit, isEncrypting, error: encryptError } = useSealEncrypt();
	const { decryptAndReveal, isDecrypting, error: decryptError } = useSealDecrypt();
	const account = useCurrentAccount();
	const dAppKit = useDAppKit();
	const [txStatus, setTxStatus] = useState<string | null>(null);

	const handleCommit = useCallback(
		async (params: { isUp: boolean; amount: string }) => {
			if (!account || !round) return;
			setTxStatus("Encrypting order with SEAL...");

			try {
				const amountMist = BigInt(
					Math.floor(Number.parseFloat(params.amount) * Number(MIST_PER_SUI)),
				);
				const signer = new CurrentAccountSigner(dAppKit);

				const { transaction } = await encryptAndCommit(
					round.id,
					BigInt(round.commitDeadlineMs),
					params.isUp,
					amountMist,
					account.address,
				);

				setTxStatus("Signing transaction...");
				await signer.signAndExecuteTransaction({ transaction });
				setTxStatus("Order committed!");
				setTimeout(() => {
					setTxStatus(null);
					refetch();
				}, 2000);
			} catch (err) {
				setTxStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
				setTimeout(() => setTxStatus(null), 5000);
			}
		},
		[account, round, dAppKit, encryptAndCommit, refetch],
	);

	const handleReveal = useCallback(async () => {
		if (!account || !round) return;
		setTxStatus("Decrypting order from SEAL...");

		try {
			const signer = new CurrentAccountSigner(dAppKit);

			const { transaction } = await decryptAndReveal(
				round.id,
				account.address,
				async (message: Uint8Array) => {
					const result = await signer.signPersonalMessage(message);
					return { signature: result.signature };
				},
			);

			setTxStatus("Signing reveal transaction...");
			await signer.signAndExecuteTransaction({ transaction });
			setTxStatus("Order revealed!");
			setTimeout(() => {
				setTxStatus(null);
				refetch();
			}, 2000);
		} catch (err) {
			setTxStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
			setTimeout(() => setTxStatus(null), 5000);
		}
	}, [account, round, dAppKit, decryptAndReveal, refetch]);

	const handleClaim = useCallback(async () => {
		if (!account || !round) return;
		setTxStatus("Claiming payout...");

		try {
			const signer = new CurrentAccountSigner(dAppKit);
			const tx = new Transaction();
			tx.moveCall({
				target: `${SHADOWBOOK_PACKAGE_ID}::shadowbook::claim_payout`,
				arguments: [tx.object(round.id), tx.object(CLOCK_ID)],
			});

			await signer.signAndExecuteTransaction({ transaction: tx });
			setTxStatus("Payout claimed!");
			setTimeout(() => {
				setTxStatus(null);
				refetch();
			}, 2000);
		} catch (err) {
			setTxStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
			setTimeout(() => setTxStatus(null), 5000);
		}
	}, [account, round, dAppKit, refetch]);

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

	const userRevealed = round.revealedOrders.find((o) => o.trader === account?.address);
	const outcomeStr =
		round.actualOutcome === true ? "UP" : round.actualOutcome === false ? "DOWN" : null;

	return (
		<div style={{ maxWidth: "40rem", margin: "0 auto" }}>
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

			{timeRemaining && timeRemaining.totalMs > 0 && (
				<TimeDisplay
					label={timeRemaining.label}
					hours={timeRemaining.hours}
					minutes={timeRemaining.minutes}
					seconds={timeRemaining.seconds}
				/>
			)}

			{txStatus && (
				<StatusMessage
					text={txStatus}
					color={txStatus.startsWith("Error") ? "#FF4444" : "#00FF41"}
				/>
			)}
			{encryptError && <StatusMessage text={encryptError} color="#FF4444" />}
			{decryptError && <StatusMessage text={decryptError} color="#FF4444" />}

			{!account && (
				<div
					style={{
						fontFamily: MONO,
						fontSize: "0.8rem",
						color: "#555",
						textAlign: "center",
						padding: "2rem 0",
						border: "1px dashed #1a1a1a",
						borderRadius: "4px",
					}}
				>
					Connect wallet to participate
				</div>
			)}

			{account && (
				<div
					style={{
						border: "1px solid #1a1a1a",
						borderRadius: "4px",
						padding: "0 1.25rem",
						backgroundColor: "#0f0f0f",
					}}
				>
					{round.status === "Open" && (
						<CommitForm roundId={round.id} onCommit={handleCommit} disabled={isEncrypting} />
					)}

					{round.status === "Reveal" && (
						<RevealButton roundId={round.id} onReveal={handleReveal} disabled={isDecrypting} />
					)}

					{(round.status === "Settled" || round.status === "Execute") && (
						<ResultsPanel
							outcome={outcomeStr}
							revealedOrders={round.revealedOrders}
							userAddress={account.address}
							claimable={round.status === "Settled" && !!userRevealed}
							onClaim={handleClaim}
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
			)}
		</div>
	);
}

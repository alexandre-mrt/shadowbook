"use client";

import { ADMIN_CAP_ID, CLOCK_ID, SHADOWBOOK_PACKAGE_ID } from "@/lib/constants";
import { CurrentAccountSigner } from "@mysten/dapp-kit-core";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import Link from "next/link";
import { useState } from "react";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export default function AdminPage() {
	const account = useCurrentAccount();
	const dAppKit = useDAppKit();
	const [oracleLabel, setOracleLabel] = useState("BTC/USD");
	const [strike, setStrike] = useState("105000");
	const [commitMinutes, setCommitMinutes] = useState("10");
	const [revealMinutes, setRevealMinutes] = useState("5");
	const [status, setStatus] = useState<string | null>(null);
	const [createdRoundId, setCreatedRoundId] = useState<string | null>(null);

	const handleCreate = async () => {
		if (!account) return;
		setStatus("Creating round...");

		try {
			const signer = new CurrentAccountSigner(dAppKit);
			const tx = new Transaction();

			const oracleId = "0x0000000000000000000000000000000000000000000000000000000000000001";
			const expiryMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
			const commitDurationMs = Number.parseInt(commitMinutes) * 60 * 1000;
			const revealDurationMs = Number.parseInt(revealMinutes) * 60 * 1000;

			tx.moveCall({
				target: `${SHADOWBOOK_PACKAGE_ID}::shadowbook::create_round`,
				arguments: [
					tx.object(ADMIN_CAP_ID),
					tx.pure.id(oracleId),
					tx.pure.u64(expiryMs),
					tx.pure.u64(Number.parseInt(strike)),
					tx.pure.u64(commitDurationMs),
					tx.pure.u64(revealDurationMs),
					tx.object(CLOCK_ID),
				],
			});

			await signer.signAndExecuteTransaction({ transaction: tx });
			setStatus("Round created! Go to home page to see it.");
			setCreatedRoundId("created");
		} catch (err) {
			setStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
		}
	};

	if (!account) {
		return (
			<div
				style={{
					fontFamily: MONO,
					fontSize: "0.8rem",
					color: "#555",
					textAlign: "center",
					padding: "3rem",
				}}
			>
				Connect wallet to access admin
			</div>
		);
	}

	return (
		<div style={{ maxWidth: "32rem", margin: "0 auto" }}>
			<div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
				<Link
					href="/"
					style={{ fontFamily: MONO, fontSize: "0.8rem", color: "#555", textDecoration: "none" }}
				>
					← Back
				</Link>
				<span
					style={{
						fontFamily: MONO,
						fontSize: "0.7rem",
						color: "#444",
						letterSpacing: "0.2em",
						textTransform: "uppercase",
					}}
				>
					Admin — Create Round
				</span>
			</div>

			<div
				style={{
					border: "1px solid #1a1a1a",
					borderRadius: "4px",
					padding: "1.5rem",
					backgroundColor: "#0f0f0f",
				}}
			>
				<Field label="ORACLE" value={oracleLabel} onChange={setOracleLabel} />
				<Field label="STRIKE PRICE" value={strike} onChange={setStrike} type="number" />
				<Field
					label="COMMIT WINDOW (MINUTES)"
					value={commitMinutes}
					onChange={setCommitMinutes}
					type="number"
				/>
				<Field
					label="REVEAL WINDOW (MINUTES)"
					value={revealMinutes}
					onChange={setRevealMinutes}
					type="number"
				/>

				<button
					type="button"
					onClick={handleCreate}
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
						marginTop: "0.5rem",
					}}
				>
					CREATE ROUND
				</button>
			</div>

			{status && (
				<div
					style={{
						fontFamily: MONO,
						fontSize: "0.75rem",
						color: status.startsWith("Error") ? "#FF4444" : "#00FF41",
						padding: "1rem",
						border: `1px solid ${status.startsWith("Error") ? "#FF4444" : "#00FF41"}33`,
						borderRadius: "4px",
						backgroundColor: "#0f0f0f",
						marginTop: "1rem",
						textAlign: "center",
					}}
				>
					{status}
				</div>
			)}

			{createdRoundId && (
				<Link
					href="/"
					style={{
						display: "block",
						fontFamily: MONO,
						fontSize: "0.75rem",
						color: "#00FF41",
						textAlign: "center",
						marginTop: "0.75rem",
						textDecoration: "underline",
					}}
				>
					View rounds →
				</Link>
			)}
		</div>
	);
}

function Field({
	label,
	value,
	onChange,
	type = "text",
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
	return (
		<div style={{ marginBottom: "1rem" }}>
			<label
				style={{
					fontFamily: MONO,
					fontSize: "0.65rem",
					color: "#555",
					letterSpacing: "0.1em",
					display: "block",
					marginBottom: "0.35rem",
				}}
			>
				{label}
			</label>
			<input
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				style={{
					width: "100%",
					padding: "0.6rem",
					border: "1px solid #1a1a1a",
					borderRadius: "4px",
					backgroundColor: "#0A0A0A",
					color: "#e0e0e0",
					fontFamily: MONO,
					fontSize: "0.85rem",
					outline: "none",
					boxSizing: "border-box",
				}}
			/>
		</div>
	);
}

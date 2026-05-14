"use client";

import { useState } from "react";

interface CommitFormProps {
	roundId: string;
	onCommit: (params: { isUp: boolean; amount: string }) => void;
	disabled?: boolean;
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function CommitForm({ roundId: _roundId, onCommit, disabled }: CommitFormProps) {
	const [isUp, setIsUp] = useState<boolean | null>(null);
	const [amount, setAmount] = useState("");

	const canSubmit = isUp !== null && Number(amount) > 0 && !disabled;

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
				Your Prediction
			</div>

			<div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem" }}>
				<button
					type="button"
					onClick={() => setIsUp(true)}
					style={{
						flex: 1,
						padding: "1rem",
						border: `1px solid ${isUp === true ? "#00FF41" : "#1a1a1a"}`,
						borderRadius: "4px",
						backgroundColor: isUp === true ? "rgba(0,255,65,0.06)" : "#0f0f0f",
						color: isUp === true ? "#00FF41" : "#666",
						fontFamily: MONO,
						fontSize: "1.25rem",
						fontWeight: 700,
						cursor: "pointer",
						transition: "all 0.15s",
					}}
				>
					▲ UP
				</button>
				<button
					type="button"
					onClick={() => setIsUp(false)}
					style={{
						flex: 1,
						padding: "1rem",
						border: `1px solid ${isUp === false ? "#FF4444" : "#1a1a1a"}`,
						borderRadius: "4px",
						backgroundColor: isUp === false ? "rgba(255,68,68,0.06)" : "#0f0f0f",
						color: isUp === false ? "#FF4444" : "#666",
						fontFamily: MONO,
						fontSize: "1.25rem",
						fontWeight: 700,
						cursor: "pointer",
						transition: "all 0.15s",
					}}
				>
					▼ DOWN
				</button>
			</div>

			<div style={{ marginBottom: "1.25rem" }}>
				<label
					style={{
						fontFamily: MONO,
						fontSize: "0.7rem",
						color: "#555",
						letterSpacing: "0.1em",
						display: "block",
						marginBottom: "0.4rem",
					}}
				>
					AMOUNT (SUI)
				</label>
				<input
					type="number"
					min="0"
					step="0.1"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					placeholder="0.0"
					style={{
						width: "100%",
						padding: "0.75rem",
						border: "1px solid #1a1a1a",
						borderRadius: "4px",
						backgroundColor: "#0f0f0f",
						color: "#e0e0e0",
						fontFamily: MONO,
						fontSize: "1rem",
						outline: "none",
						boxSizing: "border-box",
					}}
					onFocus={(e) => {
						e.target.style.borderColor = "#333";
					}}
					onBlur={(e) => {
						e.target.style.borderColor = "#1a1a1a";
					}}
				/>
			</div>

			<button
				type="button"
				disabled={!canSubmit}
				onClick={() => {
					if (isUp !== null) onCommit({ isUp, amount });
				}}
				style={{
					width: "100%",
					padding: "0.85rem",
					border: "none",
					borderRadius: "4px",
					backgroundColor: canSubmit ? "#00FF41" : "#1a1a1a",
					color: canSubmit ? "#0A0A0A" : "#444",
					fontFamily: MONO,
					fontSize: "0.85rem",
					fontWeight: 700,
					letterSpacing: "0.1em",
					cursor: canSubmit ? "pointer" : "not-allowed",
					transition: "all 0.15s",
				}}
			>
				ENCRYPT & COMMIT
			</button>
		</div>
	);
}

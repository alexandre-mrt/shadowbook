"use client";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface RevealButtonProps {
	roundId: string;
	onReveal: () => void;
	disabled?: boolean;
}

export function RevealButton({ roundId, onReveal, disabled }: RevealButtonProps) {
	const storageKey = `shadowbook_order_${roundId}`;
	const hasSavedOrder = typeof window !== "undefined" && localStorage.getItem(storageKey) !== null;

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
				Reveal Phase
			</div>

			{hasSavedOrder ? (
				<div
					style={{
						padding: "0.75rem",
						border: "1px solid #1a1a1a",
						borderRadius: "4px",
						backgroundColor: "#0f0f0f",
						marginBottom: "1rem",
						fontFamily: MONO,
						fontSize: "0.75rem",
						color: "#888",
					}}
				>
					✓ Order found in local storage — ready to decrypt and reveal
				</div>
			) : (
				<div
					style={{
						padding: "0.75rem",
						border: "1px solid rgba(255,68,68,0.3)",
						borderRadius: "4px",
						backgroundColor: "rgba(255,68,68,0.04)",
						marginBottom: "1rem",
						fontFamily: MONO,
						fontSize: "0.75rem",
						color: "#FF4444",
					}}
				>
					⚠ No saved order found — you may have committed from a different device
				</div>
			)}

			<button
				type="button"
				disabled={disabled || !hasSavedOrder}
				onClick={onReveal}
				style={{
					width: "100%",
					padding: "0.85rem",
					border: "none",
					borderRadius: "4px",
					backgroundColor: !disabled && hasSavedOrder ? "#FFD700" : "#1a1a1a",
					color: !disabled && hasSavedOrder ? "#0A0A0A" : "#444",
					fontFamily: MONO,
					fontSize: "0.85rem",
					fontWeight: 700,
					letterSpacing: "0.1em",
					cursor: !disabled && hasSavedOrder ? "pointer" : "not-allowed",
					transition: "all 0.15s",
				}}
			>
				DECRYPT & REVEAL
			</button>
		</div>
	);
}

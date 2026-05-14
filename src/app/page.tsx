"use client";

import { RoundCard } from "@/components/RoundCard";
import { useRounds } from "@/hooks/useRounds";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export default function HomePage() {
	const { rounds, isLoading, error } = useRounds();

	return (
		<div>
			<div
				style={{
					fontFamily: MONO,
					fontSize: "0.7rem",
					color: "#444",
					letterSpacing: "0.2em",
					marginBottom: "1.5rem",
					textTransform: "uppercase",
				}}
			>
				Active Rounds
			</div>

			{isLoading && (
				<div
					style={{
						fontFamily: MONO,
						fontSize: "0.8rem",
						color: "#555",
						padding: "3rem 0",
						textAlign: "center",
					}}
				>
					Loading rounds...
				</div>
			)}

			{error && (
				<div
					style={{
						fontFamily: MONO,
						fontSize: "0.8rem",
						color: "#FF4444",
						padding: "3rem 0",
						textAlign: "center",
					}}
				>
					Failed to load rounds
				</div>
			)}

			{!isLoading && !error && rounds.length === 0 && (
				<div
					style={{
						fontFamily: MONO,
						fontSize: "0.8rem",
						color: "#555",
						padding: "3rem 0",
						textAlign: "center",
						border: "1px dashed #1a1a1a",
						borderRadius: "4px",
					}}
				>
					No active rounds
				</div>
			)}

			{rounds.length > 0 && (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
						gap: "1rem",
					}}
				>
					{rounds.map((round) => (
						<RoundCard key={round.id} round={round} />
					))}
				</div>
			)}
		</div>
	);
}

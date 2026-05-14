"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const ConnectButton = dynamic(
	() => import("@mysten/dapp-kit-react/ui").then((m) => m.ConnectButton),
	{ ssr: false },
);

export function Header() {
	return (
		<header
			style={{
				backgroundColor: "#0A0A0A",
				borderBottom: "1px solid #1a1a1a",
				padding: "0 1.5rem",
				height: "3.5rem",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				position: "sticky",
				top: 0,
				zIndex: 50,
			}}
		>
			<Link
				href="/"
				style={{
					textDecoration: "none",
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					fontSize: "1.1rem",
					fontWeight: 700,
					letterSpacing: "0.15em",
					userSelect: "none",
				}}
			>
				<span style={{ color: "#00FF41" }}>SHADOW</span>
				<span style={{ color: "#e0e0e0" }}> BOOK</span>
			</Link>

			<div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
				<Link
					href="/admin"
					style={{
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "0.65rem",
						color: "#555",
						letterSpacing: "0.1em",
						textDecoration: "none",
						border: "1px solid #1f1f1f",
						padding: "0.2rem 0.5rem",
						borderRadius: "2px",
					}}
				>
					ADMIN
				</Link>
				<span
					style={{
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "0.7rem",
						color: "#555",
						letterSpacing: "0.1em",
						border: "1px solid #1f1f1f",
						padding: "0.2rem 0.5rem",
						borderRadius: "2px",
					}}
				>
					TESTNET
				</span>

				<ConnectButton />
			</div>
		</header>
	);
}

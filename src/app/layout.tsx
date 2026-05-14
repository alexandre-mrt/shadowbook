import { Header } from "@/components/Header";
import { SuiProvider } from "@/providers/SuiProvider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "ShadowBook — MEV-Resistant Predictions",
	description: "Encrypted prediction markets powered by SEAL time-lock encryption on Sui",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					backgroundColor: "#0A0A0A",
					color: "#e0e0e0",
					fontFamily: "system-ui, -apple-system, sans-serif",
					minHeight: "100vh",
				}}
			>
				<SuiProvider>
					<Header />
					<main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
						{children}
					</main>
				</SuiProvider>
			</body>
		</html>
	);
}

"use client";

// DAppKitProvider from @mysten/dapp-kit-react requires a pre-created DAppKit instance.
// createDAppKit from @mysten/dapp-kit-core builds the instance with networks + createClient.
// We must create it outside the component to avoid re-creation on each render.

import { NETWORK } from "@/lib/constants";
import { createDAppKit } from "@mysten/dapp-kit-core";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 2,
		},
	},
});

const dAppKit = createDAppKit({
	networks: [NETWORK] as const,
	defaultNetwork: NETWORK,
	createClient: (network) =>
		new SuiJsonRpcClient({
			url: getJsonRpcFullnodeUrl(network as "testnet"),
			network,
		}),
	enableBurnerWallet: false,
});

export function SuiProvider({ children }: PropsWithChildren) {
	return (
		<QueryClientProvider client={queryClient}>
			<DAppKitProvider dAppKit={dAppKit}>{children}</DAppKitProvider>
		</QueryClientProvider>
	);
}

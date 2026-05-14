"use client";

import { fetchRounds } from "@/lib/sui-client";
import type { Round } from "@/lib/sui-client";
import { useQuery } from "@tanstack/react-query";

export interface UseRoundsResult {
	rounds: Round[];
	isLoading: boolean;
	error: Error | null;
}

export function useRounds(): UseRoundsResult {
	const { data, isLoading, error } = useQuery({
		queryKey: ["rounds"],
		queryFn: fetchRounds,
		staleTime: 15_000,
		refetchInterval: 30_000,
	});

	return {
		rounds: data ?? [],
		isLoading,
		error: error as Error | null,
	};
}

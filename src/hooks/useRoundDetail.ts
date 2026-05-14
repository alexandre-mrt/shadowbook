"use client";

import { fetchRoundById } from "@/lib/sui-client";
import type { Round } from "@/lib/sui-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export interface TimeRemaining {
	totalMs: number;
	hours: number;
	minutes: number;
	seconds: number;
	label: string;
}

export interface UseRoundDetailResult {
	round: Round | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
	timeRemaining: TimeRemaining | null;
}

function computeTimeRemaining(round: Round): TimeRemaining | null {
	const now = Date.now();

	let targetMs: number;
	let label: string;

	switch (round.status) {
		case "Open":
			targetMs = round.commitDeadlineMs;
			label = "Commit closes in";
			break;
		case "Reveal":
			targetMs = round.revealDeadlineMs;
			label = "Reveal closes in";
			break;
		default:
			return null;
	}

	const totalMs = Math.max(0, targetMs - now);
	const totalSeconds = Math.floor(totalMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	return { totalMs, hours, minutes, seconds, label };
}

export function useRoundDetail(id: string): UseRoundDetailResult {
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["round", id],
		queryFn: () => fetchRoundById(id),
		staleTime: 10_000,
		refetchInterval: 15_000,
		enabled: !!id,
	});

	const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);

	useEffect(() => {
		if (!data) {
			setTimeRemaining(null);
			return;
		}

		const update = () => setTimeRemaining(computeTimeRemaining(data));
		update();

		const interval = setInterval(update, 1000);
		return () => clearInterval(interval);
	}, [data]);

	return {
		round: data ?? null,
		isLoading,
		error: error as Error | null,
		refetch,
		timeRemaining,
	};
}

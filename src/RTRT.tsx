import { FC, MutableRefObject, PropsWithChildren, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { styled } from "styled-components";

const BaseURL	= "https://api.rtrt.me/";
const EventsURL	= `${BaseURL}events/CC-2023/`;
const appid		= "592479603a4c925a288b4567";
const token		= "09f12559c34029bfd6dae00301ed57b1";

type RTRTCache = Record<string, { data?: unknown, expiry?: number } | undefined>

const RTRTCacheContext = createContext<{
	updated?: number;
	cache?: MutableRefObject<RTRTCache>;
	setCache: (update: ((prev: RTRTCache) => RTRTCache) | RTRTCache) => void;
}>({ setCache: () => {} });

export const RTRTCacheContextProvider: FC<PropsWithChildren<{}>> = ({ children }) =>
{
	const [updated, setUpdated] = useState<number>();
	const cache = useRef<RTRTCache>({});
	const setCache = useCallback(
		(update: ((prev: RTRTCache) => RTRTCache) | RTRTCache) => {
			if (typeof update === "function")
				cache.current = update(cache.current);
			else
				cache.current = update;

			setUpdated(Date.now());
		},
		[cache]);
	return <RTRTCacheContext.Provider children={children} value={{ updated, cache, setCache }} />
}

let loading = false;

export function useApi<T>(path: string, maxAgeMs=300000, extras: string = "", tick?: unknown): T | undefined
{
	const { cache, setCache } = useContext(RTRTCacheContext);

	const cacheKey		= path + "/" + extras;
	const cacheEntry	= cache?.current[cacheKey];

	useEffect(() =>
		{
			if (cacheEntry)
			{
				if (loading)
					return;

				if (cacheEntry.expiry && Date.now() < cacheEntry.expiry)
					return;
			}
			
			loading = true;

			fetch(`${EventsURL}${path}?appid=${appid}&token=${token}${extras}`)
				.then(res => res.json())
				.then(data => setCache(cache => ({ ...cache, [cacheKey]: { data, expiry: Date.now() + maxAgeMs } })))
				.finally(() => loading = false);
		},
		[cacheEntry, setCache, cacheKey, path, extras, maxAgeMs, tick]);

	return cacheEntry?.data as T | undefined;
}

export const LastUpdated = () =>
{
	const { updated } = useContext(RTRTCacheContext);
	if (!updated)
		return null;

	return <StyledLastUpdated>Last updated:{" "}{new Date(updated).toLocaleString()}</StyledLastUpdated>
}

export const useLastUpdated = () => useContext(RTRTCacheContext).updated;

const StyledLastUpdated = styled.div`
	position: absolute;
	left: 0;
	bottom: 0;
	padding: 2px;
	font-size: 11px;
	z-index: 1000;
	background: #f0f0f0;
`;
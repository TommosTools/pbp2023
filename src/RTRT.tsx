import { FC, PropsWithChildren, createContext, useContext, useEffect, useRef, useState } from "react";

const BaseURL	= "https://api.rtrt.me/";
const EventsURL	= `${BaseURL}events/CC-2023/`;
const appid		= "592479603a4c925a288b4567";
const token		= "09f12559c34029bfd6dae00301ed57b1";

type RTRTCache = Record<string, { data?: unknown, expiry?: number, loading: boolean } | undefined>

const RTRTCacheContext = createContext<{ cache: RTRTCache, setCache: React.Dispatch<React.SetStateAction<RTRTCache>> }>({ cache: {}, setCache: () => { } });

export const RTRTCacheContextProvider: FC<PropsWithChildren<{}>> = ({ children }) =>
{
	const [cache, setCache] = useState<RTRTCache>({});
	return <RTRTCacheContext.Provider children={children} value={{ cache, setCache }} />
}

export function useApi<T>(path: string, maxAgeMs=300000, extras: string = ""): T | undefined
{
	const { cache, setCache } = useContext(RTRTCacheContext);

	const cacheKey		= path + "/" + extras;
	const cacheEntry	= cache[cacheKey];

	useEffect(() =>
		{
			if (cacheEntry)
			{
				if (cacheEntry.loading)
					return;

				if (cacheEntry.expiry && Date.now() < cacheEntry.expiry)
					return;
			}
			
			setCache(cache => ({ ...cache, [cacheKey]: { ...cache[cacheKey], loading: true } }));
			
			fetch(`${EventsURL}${path}?appid=${appid}&token=${token}${extras}`)
				.then(res => res.json())
				.then(data => setCache(cache => ({ ...cache, [cacheKey]: { data, expiry: Date.now() + maxAgeMs, loading: false } })))
				.catch(() => setCache(cache => ({ ...cache, [cacheKey]: { loading: false } })))
		},
		[cacheEntry, setCache, cacheKey, path, extras, maxAgeMs]);

	return cacheEntry?.data as T | undefined;
}
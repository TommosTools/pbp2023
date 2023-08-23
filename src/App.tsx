import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap, ScaleControl } from "react-leaflet";
import { Icon, type Popup as TPopup, type LatLngExpression } from "leaflet";
import route from "./route.json";
import participants from "./participants.json";
import { GeoJsonObject, LineString } from "geojson";
import { LastUpdated, RTRTCacheContextProvider, useApi, useLastUpdated } from "./RTRT";
import checkpointImage from "./icons/checkpoint.svg";
import bikeImage from "./icons/bike.svg";
import bikeBackImage from "./icons/bike-back.svg";
import { createGlobalStyle, css, styled } from "styled-components";
import { FC, MutableRefObject, PropsWithChildren, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import along from "@turf/along";
import pointLookup from "./pointLookup.json";

const checkpointIcon = new Icon({
	iconUrl: checkpointImage,
	iconSize: [30, 24],
	iconAnchor: [15, 12],
	popupAnchor: [1, -12],
})

const bikeIcon = new Icon({
	iconUrl: bikeImage,
	iconSize: [30, 24],
	iconAnchor: [15, 12],
	popupAnchor: [1, -12],

})

function makeBikeBackIcon(pc: number)
{
	const roundPc = Math.max(50, Math.min(Math.round((pc / 10)) * 10, 100));

	return new Icon({
		iconUrl: bikeBackImage,
		iconSize: [30, 24],
		iconAnchor: [15, 12],
		popupAnchor: [1, -12],
		...{ className: `pc${roundPc}` },
	})	
}

const OpeningContext = createContext<{ id?: string, setId: (id: string | undefined) => void }>({ setId: () => {} });

const OpeningContextProvider: FC<PropsWithChildren<{}>> = ({ children }) =>
{
	const [id, setId] = useState<string | undefined>(undefined);

	return <OpeningContext.Provider	children={children} value={{ id, setId }} />
}

function App()
{
	const position: LatLngExpression = [48.505, -1];
	const zoom = 8;

	return (<>
		<GlobalStyle/>
		<OpeningContextProvider>
			<RTRTCacheContextProvider>
				<MapContainer center={position} zoom={zoom} scrollWheelZoom={true} style={{ width: "100vw", height: "100vh" }}>
					<TileLayer
						attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
						url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
					/>
					<ScaleControl position="bottomright" />
					<GeoJSON
						data={route as GeoJsonObject}
					/>
					<Checkpoints/>
					<ParticipantMarkers/>
				</MapContainer>

				<TopRight>
					<Participants/>
					<LatestEvents/>
				</TopRight>

				<LastUpdated/>
			</RTRTCacheContextProvider>
		</OpeningContextProvider>
	</>);
}

type Checkpoint = {
	km: string;
	miles: string;
	name: string;
	label: string;
	alias: string[];
	coords?: { lat: string; lng: string };
}

type CheckpointList = { list: Checkpoint[] }

const Checkpoints = () =>
{
	const checkpoints = useApi<CheckpointList>("points", 3600000);

	return <>{
		checkpoints?.list
			.filter(checkpoint => checkpoint.coords)
			.reverse()
			.map((checkpoint, index) =>
				<Marker
					icon={checkpointIcon}
					position={[+checkpoint.coords!.lat, +checkpoint.coords!.lng]}
					key={index}
					zIndexOffset={-1}
				>
					<Popup>
						<b>{checkpoint.name}</b>
						<br />
						{checkpoint.km} km / {checkpoint.miles} mi
					</Popup>
				</Marker>
			)
	}</>;
}

/*
{"list":[{"u":"1692516234_000077","i":"1691134795_000092","_ver":"3","bib":"F144","class":"open","country":"GB","country_iso":"gb","course":"bike","fname":"Judith","lname":"Swallow","name":"Judith Swallow","pid":"RHBZ6FA7","profile_color":"12","race":"Paris-Brest-Paris","sex":"F","tag":"01449","team":"VC 167","bib_display":"No. F144","claim_mode":"1"},{"u":"1692516262_000266","i":"1691134809_000666","_ver":"7","bib":"P094","class":"open","country":"PL","country_iso":"pl","course":"bike","fname":"Izabela","lname":"Murtagh","name":"Izabela Murtagh","pid":"RRWPVTYH","profile_color":"6","race":"Paris-Brest-Paris","sex":"F","tag":"04387","team":"Audax Ecosse","claimed_by":"UGNPWM7Z","profile_pic":"/user/UGNPWM7Z/img","bib_display":"No. P094","claim_mode":"1"},{"u":"1692516277_000006","i":"1691134817_000098","_ver":"3","bib":"W248","class":"open","country":"GB","country_iso":"gb","course":"bike","fname":"Matthew","lname":"Clarke","name":"Matthew Clarke","pid":"R2WC6GRF","profile_color":"15","race":"Paris-Brest-Paris","sex":"M","tag":"06458","team":"Scottish Borders Randonneur","bib_display":"No. W248","claim_mode":"1"}],"info":{"first":"1","last":"3","cacheVer":"0~0"}}

*/
type Profile = {
	country: string;
	fname: string;
	lname: string;
	name: string;
	pid: string;
	sex: string;
	tag: string;
}

type Geo = {
	lpn: string;
	sslp: string;
	ecoords?: {
		lat: string;
		lng: string;
	};
	epc: string;
	emiles: string;
	mph: string;
	sss: string;
	last?: {
		npm: string;
		lpm: string;
		npn: string;
	}
	multiplier?: string;
}

const codes = participants.map(p => p.pid).join(",");

const useProfilesWithGeo = (tick?: unknown) =>
	useApi<{ list: Profile[], info: { loc: Record<string, Geo> } }>(`profiles/${codes}`, 60000, "&max=30&loc=1&ecoords=1");

const ParticipantMarkers = () => {
	const profiles = useProfilesWithGeo();

	const geos = useMemo(
		() => profiles?.list.filter(p => profiles.info.loc[p.pid].multiplier).map(p => ({ profile: p, geo: profiles.info.loc[p.pid] })),
		[profiles]
	);

	const popups = useRef<Record<string, TPopup | null>>({});

	const { id: openId, setId } = useContext(OpeningContext);
	const map = useMap();
	useEffect(() =>
		{
			if (openId)
			{
				popups.current[openId]?.openOn(map);
				setId(undefined);
			}
		},
		[openId, map, setId]
	);

	return (<>
		{ geos?.map(({ profile, geo }) =>
			<ParticipantMarker profile={profile} geo={geo} key={profile.pid} popups={popups} />) }
	</>);
}

const EventLength = 757.45;	// miles
const MaxAverageSpeed = 20;	// mph

function useEstimatedPosition(geo: Geo)
{
	return useMemo(() =>
		{
			const estimatedSpeed = Math.min(
				+geo.mph,
				geo.last?.lpm ? (+geo.last.lpm / (+geo.sss / 3600)) : Infinity,
				MaxAverageSpeed
			);
			const nextDistance = geo.last?.npm ? +geo.last.npm : Infinity;
			const distance = Math.min(nextDistance, +geo.emiles + (estimatedSpeed * (+geo.sslp / 3600)));

			const nextPoint = geo.last && (pointLookup as any)[geo.last.npn];
			const estPos = along(route.features[0].geometry as LineString, distance, { units: "miles" }).geometry.coordinates;
			const pos =
				distance === nextDistance && nextPoint
					?	[+nextPoint.lng, +nextPoint.lat]
					:	estPos;

			return { distance, pos };
		},
		[geo]);
}

const ParticipantMarker: FC<{ profile: Profile, geo: Geo, popups: MutableRefObject<Record<string, TPopup | null>> }> = ({ profile, geo, popups }) =>
{
	const updated = useLastUpdated();
	const { distance, pos } = useEstimatedPosition(geo);
	const icon = useMemo(() =>
		+geo.emiles < 375 ? bikeIcon : makeBikeBackIcon(+geo.epc),
		[geo]
	);
	return (
		<Marker
			icon={icon}
			// position={[+geo.ecoords!.lat, +geo.ecoords!.lng]}
			position={[pos[1], pos[0]]}
			zIndexOffset={1}
		>
			<Popup ref={ popup => popups.current[profile.pid] = popup }>
				<b>{profile.name}</b>
				<br/>
				Last seen: { formatTime(updated! - 1000 * +geo.sslp) }
				<br/>
				at {geo.lpn}
				{ geo.last?.lpm && ` (${(+geo.last.lpm * 1.61).toFixed(1)} km / ${(+geo.last.lpm).toFixed(1)} mi)` }
				<br/>
				Estimated distance from start: { (distance * 1.61).toFixed(1) } km / {distance.toFixed(1)} mi
			</Popup>
		</Marker>
	);
}

function formatTime(timestamp: number)
{
	const seconds = (Date.now() - timestamp) / 1000;

	if (seconds < 100)
		return `${ seconds.toFixed(0) }s ago`;
	else if (seconds < 20 * 60)
		return `${ Math.round(seconds / 60) } minutes ago`;
	else if (seconds < 24 * 60 * 60)
		return (new Date(timestamp)).toTimeString().replace(/.*?(\d{2}:\d{2}).*(\(.*\))/, '$1 $2').replace(/British Summer Time/, "BST");
	else
		return (new Date(timestamp)).toString();
}

const TopRight = styled.div`
	position: absolute;
	right: 5px;
	top: 5px;
	width: 120px;
	z-index: 1000;
	max-height: calc(70vh);

	display: flex;
	flex-direction: column;
`;

const LatestEvents = () =>
{
	const updated	= useLastUpdated();
	const profiles	= useProfilesWithGeo();
	const events	= useMemo(() =>
		profiles?.info.loc
			?	Object.entries(profiles.info.loc)
					.filter(([, geo]) => geo.last)
					.sort(([,a], [,b]) => +a.sslp - +b.sslp)
					.slice(0, 3)
					.map(([id, geo]) => ({ profile: profiles.list.find(p => p.pid === id), geo }))
			:	[],
		[profiles]
	);

	const { setId } = useContext(OpeningContext);

	return (
		<StyledLatestEvents>
			<EventsHeader>Latest check-ins</EventsHeader>
			{ events.map(event =>
				<StyledEvent key={event.profile?.pid} onClick={ () => setId(event.profile?.pid) }>
					<div><b>{ event.profile?.name }</b></div>
					<div>at { event.geo.lpn }</div>
					<div>({ formatTime(updated! - 1000 * +event.geo.sslp) })</div>
				</StyledEvent>) }
		</StyledLatestEvents>
	);
}

const EventsHeader = styled.div`
	padding: 3px;
	font-weight: bold;
`;

const StyledLatestEvents = styled.div`
	margin-top: 5px;
	border: 1px solid #666;
	background: white;
	flex-shrink: 0;
`;

const StyledEvent = styled.div`
	cursor: pointer;
	padding: 3px;
	& > div {
		overflow-x: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
`;

const Participants = () =>
{
	const [tick, setTick] = useState(0);
	useEffect(() =>
		{
			const id = setInterval(() => setTick(tick => tick + 1), 15000);
			return () => clearInterval(id);
		},
		[setTick])

	const profiles = useProfilesWithGeo(tick);

	const [opened, setOpened] = useState(false);

	const sortedProfiles = useMemo(
		() => profiles?.list.sort((a, b) => {
			/*
			const epcA = +profiles.info.loc[a.pid]?.epc;
			const epcB = +profiles.info.loc[b.pid]?.epc;

			if (epcA && epcB)
			{
				if (epcA > epcB) return -1;
				if (epcA < epcB) return 1;
				return 0;
			}
			else if (epcA)
			{
				return -1;
			}
			else if (epcB)
			{
				return 1;
			}
			*/

			if (a.name < b.name) return -1;
			if (a.name > b.name) return 1;
			return 0;
		}),
		[profiles]);

	return (
		<StyledParticipants key={tick}>
			<Toggle onClick={ () => setOpened(opened => !opened) }>
				{ opened ? "Hide" : "Show participants" }
			</Toggle>
			{ opened && sortedProfiles?.map(profile =>
				<Participant profile={profile} geo={profiles?.info.loc[profile.pid]} key={profile.pid} />) }
		</StyledParticipants>
	);
}

const Toggle = styled.div`
	cursor: pointer;
	text-align: right;
`;

const StyledParticipants = styled.div`
	&:not(:empty) {
		background: white;
		border: 1px solid #666;
		padding: 3px;

		flex-basis: 100%;
		flex-shrink: 1;
		overflow-y: auto;
	}
`;

const Participant: FC<{ profile: Profile, geo?: Geo }> = ({ profile, geo }) =>
{
	const { setId } = useContext(OpeningContext);
	return (
		<StyledParticipant onClick={ geo?.epc ? () => setId(profile.pid) : undefined } mode={ geo?.epc ? "active" : "inactive" }>
			<b>{profile.name}</b>
		</StyledParticipant>
	);
}

const StyledParticipant = styled.div<{ mode: "active" | "inactive" }>`
	${ props => props.mode === "active"
		?	css`
			color: #666;
			cursor: pointer;
			&:hover { color: black; }
		`
		:	css`
			color: #999;
			cursor: default;
		`
	}
	line-height: 1.5em;
`;

export default App;

const GlobalStyle = createGlobalStyle`
	body {
		font-family: sans-serif;
		font-size: 12px;
	}

	.pc50 {   filter: invert(0.05) sepia(1) saturate(50) hue-rotate(10deg); }
	.pc60 {   filter: invert(0.06) sepia(1) saturate(50) hue-rotate(10deg); }
	.pc70 {   filter: invert(0.07) sepia(1) saturate(50) hue-rotate(10deg); }
	.pc80 {   filter: invert(0.08) sepia(1) saturate(50) hue-rotate(10deg); }
	.pc90 {   filter: invert(0.09) sepia(1) saturate(50) hue-rotate(10deg); }
	.pc100 {  filter: invert(0.11) sepia(1) saturate(50) hue-rotate(10deg); }
`
import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Loader2,
  MapPin,
  Minus,
  Plus,
} from 'lucide-react';
import { GpsStatusPill } from '../components/CommonBadges';
import { useAppData } from '../context/AppDataContext';
import type { SeverityLevel } from '../types/terra';
import { formatRoadName, haversineDistanceMeters } from '../utils/geo';
import { getMarkerStyle, isActiveHazard } from '../utils/severity';

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';

type MapSeverityFilter = 'ALL' | SeverityLevel | 'REPAIRED';

const SEVERITY_FILTERS: Array<{ value: MapSeverityFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
  { value: 'REPAIRED', label: 'Repaired' },
];

const DISTANCE_FILTERS = [
  { value: 100, label: '100 m' },
  { value: 250, label: '250 m' },
  { value: 500, label: '500 m' },
  { value: 1000, label: '1 km' },
];

const LEGEND_ITEMS = [
  { label: 'Critical', color: '#DC2626', ring: false },
  { label: 'High', color: '#C2410C', ring: false },
  { label: 'Medium', color: '#FACC15', ring: true },
  { label: 'Low', color: '#1D4ED8', ring: false },
  { label: 'Repaired', color: '#16A34A', ring: false },
];

export const MapPage: React.FC = () => {
  const {
    potholes,
    isLoading,
    isOnline,
    hasServerSnapshot,
    dataError,
    refreshData,
    riderPosition,
    gpsState,
    gpsError,
    retryGps,
    setSelectedPothole,
  } = useAppData();

  const [severityFilter, setSeverityFilter] = useState<MapSeverityFilter>('ALL');
  const [radiusMeters, setRadiusMeters] = useState<number | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState<boolean>(false);
  const [browseWithoutGps, setBrowseWithoutGps] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const riderLayerRef = useRef<L.LayerGroup | null>(null);

  // Only confirmed / reliable GPS potholes may be rendered on the map
  const confirmedPotholes = useMemo(
    () =>
      potholes.filter(
        (p) => p.gpsReliable && p.latitude !== null && p.longitude !== null
      ),
    [potholes]
  );

  const unreliableCount = potholes.length - confirmedPotholes.length;

  const filteredPotholes = useMemo(() => {
    return confirmedPotholes.filter((pothole) => {
      if (severityFilter === 'REPAIRED') {
        if (pothole.repairStatus !== 'REPAIRED') return false;
      } else if (severityFilter !== 'ALL') {
        if (!isActiveHazard(pothole) || pothole.severity !== severityFilter) return false;
      }

      if (radiusMeters !== null) {
        if (!riderPosition) return false;
        const d = haversineDistanceMeters(
          riderPosition.latitude,
          riderPosition.longitude,
          pothole.latitude!,
          pothole.longitude!
        );
        if (!Number.isFinite(d) || d > radiusMeters) return false;
      }

      return true;
    });
  }, [confirmedPotholes, severityFilter, radiusMeters, riderPosition]);

  const canRenderMap = riderPosition !== null || (browseWithoutGps && confirmedPotholes.length > 0);

  // Initialize Leaflet map once we have either GPS or user opted to view confirmed potholes
  useEffect(() => {
    if (!canRenderMap || !mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] = riderPosition
      ? [riderPosition.latitude, riderPosition.longitude]
      : [confirmedPotholes[0].latitude!, confirmedPotholes[0].longitude!];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 16,
      zoomControl: false,
    });

    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    riderLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    if (!riderPosition && confirmedPotholes.length > 1) {
      const bounds = L.latLngBounds(
        confirmedPotholes.map((p) => L.latLng(p.latitude!, p.longitude!))
      );
      map.fitBounds(bounds, { padding: [56, 120], maxZoom: 16 });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
      riderLayerRef.current = null;
    };
  }, [canRenderMap]);

  // Update rider GPS marker & accuracy ring
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = riderLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!riderPosition) return;

    const riderIcon = L.divIcon({
      className: 'terra-rider-dot',
      html: `<div style="width:20px;height:20px;border-radius:9999px;background:#14B8A6;border:3px solid #FFFFFF;box-shadow:0 2px 10px rgba(17,24,39,0.4);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    L.marker([riderPosition.latitude, riderPosition.longitude], {
      icon: riderIcon,
      zIndexOffset: 1000,
    })
      .bindTooltip('Your GPS Position', { direction: 'top' })
      .addTo(layer);

    if (riderPosition.accuracyMeters && riderPosition.accuracyMeters < 500) {
      L.circle([riderPosition.latitude, riderPosition.longitude], {
        radius: riderPosition.accuracyMeters,
        color: '#14B8A6',
        fillColor: '#14B8A6',
        fillOpacity: 0.12,
        weight: 1.5,
      }).addTo(layer);
    }
  }, [riderPosition, canRenderMap]);

  // Update pothole markers whenever live Firestore snapshot or filters change
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const pothole of filteredPotholes) {
      const style = getMarkerStyle(pothole);
      const letter = style.label === 'REPAIRED' ? 'R' : style.label === 'N/A' ? '?' : style.label.slice(0, 1);
      const safeRoad = formatRoadName(pothole.roadName).replace(/"/g, '&quot;');
      const markerIcon = L.divIcon({
        className: 'terra-pothole-marker',
        html: `<button type="button" aria-label="${style.label} pothole on ${safeRoad}" style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;padding:0;cursor:pointer;"><span style="width:34px;height:34px;border-radius:9999px;background:${style.bgHex};color:${style.textHex};border:3px solid #FFFFFF;box-shadow:0 3px 10px rgba(17,24,39,0.35);display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:12px;">${letter}</span></button>`,
        iconSize: [56, 56],
        iconAnchor: [28, 28],
      });

      const marker = L.marker([pothole.latitude!, pothole.longitude!], { icon: markerIcon });
      marker.on('click', () => setSelectedPothole(pothole));
      marker.addTo(layer);
    }
  }, [filteredPotholes, setSelectedPothole, canRenderMap]);

  const handleCenterGps = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (riderPosition) {
      map.flyTo([riderPosition.latitude, riderPosition.longitude], 16);
    } else if (filteredPotholes.length > 0) {
      const bounds = L.latLngBounds(
        filteredPotholes.map((p) => L.latLng(p.latitude!, p.longitude!))
      );
      map.fitBounds(bounds, { padding: [56, 120], maxZoom: 16 });
    }
  };

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  const waitingForFirstFix = gpsState === 'initializing' && !riderPosition;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden overscroll-none bg-[#E6EBF2]">
      {canRenderMap ? (
        <div
          ref={mapContainerRef}
          className="terra-fullmap h-full w-full"
          aria-label="OpenStreetMap road hazard map"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-6 pt-32 pb-28">
          <div className="neu-raised-2 w-full max-w-md rounded-3xl p-6 text-center">
            <div
              className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                waitingForFirstFix
                  ? 'bg-[#14B8A6]/15 text-[#006B5F]'
                  : 'bg-[#C2410C]/15 text-[#C2410C]'
              }`}
            >
              {waitingForFirstFix ? (
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              )}
            </div>
            <h1 className="mt-4 font-display text-xl font-bold text-[#111827]">
              {waitingForFirstFix
                ? 'Waiting for location'
                : gpsState === 'denied'
                  ? 'Location permission denied'
                  : 'Location unavailable'}
            </h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
              {gpsError ??
                'Waiting for location. The map centers on your GPS position once coordinates are received.'}
            </p>
            <div className="mt-5 flex flex-col gap-3">
              {!waitingForFirstFix && gpsState !== 'unsupported' && (
                <button
                  type="button"
                  onClick={retryGps}
                  className="neu-btn-slate inline-flex min-h-[56px] w-full items-center justify-center rounded-full px-6 py-3 font-display text-sm font-bold text-[#006B5F]"
                >
                  Retry location access
                </button>
              )}
              {confirmedPotholes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBrowseWithoutGps(true)}
                  className="neu-teal inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-display text-sm font-bold text-white"
                >
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>View {confirmedPotholes.length} confirmed pothole(s) on map</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating top filter bar */}
      <div
        style={{ paddingTop: 'calc(0.375rem + env(safe-area-inset-top))' }}
        className="pointer-events-none fixed left-0 right-0 top-0 z-[1100] mx-auto max-w-5xl px-2.5 sm:px-5"
      >
        <div className="pointer-events-auto neu-raised-2 flex max-h-[25vh] flex-col overflow-hidden rounded-2xl bg-[#E6EBF2] px-3 pt-2 pb-1">
          <div className="flex min-h-[34px] items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="shrink-0 whitespace-nowrap font-display text-[15px] font-bold text-[#111827] sm:text-base">
                Live Map
              </span>
              {unreliableCount > 0 && (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-[#C2410C]/15 px-2 py-0.5 text-[10px] font-bold text-[#C2410C]">
                  {unreliableCount} unconfirmed GPS hidden
                </span>
              )}
            </div>
            <GpsStatusPill compact />
          </div>

          {!filtersCollapsed && (
            <div className="min-h-0 overflow-y-auto no-scrollbar">
              <div
                role="group"
                aria-label="Severity filter"
                className="mt-1 flex h-[44px] flex-nowrap items-center gap-1.5 overflow-x-auto px-0.5 py-1 no-scrollbar"
              >
                {SEVERITY_FILTERS.map((opt) => {
                  const active = severityFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSeverityFilter(opt.value)}
                      aria-pressed={active}
                      className={`h-[34px] min-h-[34px] shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                        active ? 'neu-inset-sm text-[#006B5F]' : 'neu-raised-1 text-[#1F2937]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div
                role="group"
                aria-label="Distance filter"
                className="mt-0.5 flex h-[44px] flex-nowrap items-center gap-1.5 overflow-x-auto px-0.5 py-1 no-scrollbar"
              >
                <span className="mr-0.5 shrink-0 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
                  Radius:
                </span>
                {DISTANCE_FILTERS.map((opt) => {
                  const active = radiusMeters === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setRadiusMeters((prev) => (prev === opt.value ? null : opt.value))
                      }
                      aria-pressed={active}
                      className={`h-[34px] min-h-[34px] shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold tabular-nums transition-colors ${
                        active ? 'neu-inset-sm text-[#006B5F]' : 'neu-raised-1 text-[#1F2937]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {dataError ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-[#E6EBF2] px-2.5 py-1 text-xs font-semibold text-[#DC2626]">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{dataError.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshData()}
                    className="shrink-0 rounded-full px-2.5 py-0.5 font-bold text-[#006B5F]"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                !isLoading &&
                confirmedPotholes.length === 0 && (
                  <div className="mt-1 rounded-xl bg-[#E6EBF2] px-2.5 py-1 text-xs font-semibold text-[#1F2937]">
                    {hasServerSnapshot
                      ? potholes.length > 0
                        ? 'No confirmed GPS locations to display'
                        : 'No potholes reported'
                      : isOnline
                        ? 'Connecting…'
                        : 'Offline • no saved potholes'}
                  </div>
                )
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setFiltersCollapsed((prev) => !prev)}
            aria-expanded={!filtersCollapsed}
            aria-label={filtersCollapsed ? 'Expand map filters' : 'Collapse map filters'}
            className="mt-0.5 flex h-6 w-full shrink-0 items-center justify-center gap-1 rounded-b-xl text-[#1F2937] transition-colors hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006B5F]"
          >
            <span className="h-1 w-8 rounded-full bg-[#9CA3AF]" aria-hidden="true" />
            {filtersCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Right-side zoom controls */}
      {canRenderMap && (
        <div
          role="group"
          aria-label="Map zoom controls"
          className="pointer-events-auto fixed right-3 top-1/2 z-[1100] flex -translate-y-1/2 flex-col overflow-hidden rounded-2xl neu-raised-2 bg-[#E6EBF2] sm:right-5"
        >
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center border-b border-[#C2C9D6]/70 text-[#111827] transition-colors active:bg-[#D5DCE8]"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            className="flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center text-[#111827] transition-colors active:bg-[#D5DCE8]"
          >
            <Minus className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Bottom-right My GPS button */}
      {canRenderMap && (
        <div
          style={{ bottom: 'calc(7.375rem + env(safe-area-inset-bottom))' }}
          className="pointer-events-none fixed right-3 z-[1100] sm:right-5"
        >
          <button
            type="button"
            onClick={handleCenterGps}
            aria-label={riderPosition ? 'Center map on your GPS location' : 'Fit confirmed potholes'}
            className="pointer-events-auto neu-teal inline-flex min-h-[48px] items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white transition-transform active:scale-95"
          >
            <Crosshair className="h-4 w-4" aria-hidden="true" />
            <span>{riderPosition ? 'My GPS' : 'Fit Hazards'}</span>
          </button>
        </div>
      )}

      {/* Bottom Severity Legend */}
      <div
        style={{
          bottom: 'calc(4.375rem + env(safe-area-inset-bottom))',
          paddingBottom: '0.25rem',
        }}
        className="pointer-events-none fixed left-2.5 right-2.5 z-[1100] mx-auto max-w-5xl sm:left-5 sm:right-5"
      >
        <div
          role="region"
          aria-label="Severity legend"
          className="pointer-events-auto neu-raised-1 flex w-full flex-nowrap items-center justify-between gap-1.5 rounded-2xl bg-[#E6EBF2] px-3 py-2 text-[11px] font-bold text-[#111827]"
        >
          {LEGEND_ITEMS.map((item) => (
            <span
              key={item.label}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap"
            >
              <span
                style={{ backgroundColor: item.color }}
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  item.ring ? 'ring-1 ring-[#111827]/25' : ''
                }`}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

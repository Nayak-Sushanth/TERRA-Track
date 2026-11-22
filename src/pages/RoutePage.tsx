import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AlertTriangle,
  Crosshair,
  Info,
  Loader2,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Route as RouteIcon,
  Trash2,
} from 'lucide-react';
import { GpsStatusPill, LiveSyncPill, SeverityBadge } from '../components/CommonBadges';
import { useAppData } from '../context/AppDataContext';
import type { RouteModel } from '../types/terra';
import { formatDistance, formatRoadName } from '../utils/geo';
import {
  analyzeRouteHazards,
  buildDemoRoute,
  formatDurationMinutes,
  getPointToPointRoute,
} from '../utils/routeEngine';
import { getMarkerStyle, isActiveHazard } from '../utils/severity';

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const BUFFER_OPTIONS = [20, 30, 50];

export const RoutePage: React.FC = () => {
  const { potholes, riderPosition, gpsState, gpsError, retryGps, setSelectedPothole } =
    useAppData();

  const [route, setRoute] = useState<RouteModel | null>(null);
  const [routeMode, setRouteMode] = useState<'demo' | 'picked' | null>(null);
  const [pickingDestination, setPickingDestination] = useState<boolean>(false);
  const [bufferMeters, setBufferMeters] = useState<number>(30);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const potholesLayerRef = useRef<L.LayerGroup | null>(null);
  const riderLayerRef = useRef<L.LayerGroup | null>(null);

  const pickingRef = useRef<boolean>(pickingDestination);
  pickingRef.current = pickingDestination;

  const riderRef = useRef(riderPosition);
  riderRef.current = riderPosition;

  const analysis = useMemo(
    () => (route ? analyzeRouteHazards(route, potholes, bufferMeters) : null),
    [route, potholes, bufferMeters]
  );

  const nearRouteIds = useMemo(
    () => new Set(analysis?.hazards.map((h) => h.id) ?? []),
    [analysis]
  );

  const fitRouteBounds = useCallback((nextRoute: RouteModel) => {
    const map = mapRef.current;
    if (!map || nextRoute.points.length < 2) return;
    map.invalidateSize();
    const bounds = L.latLngBounds(nextRoute.points.map((pt) => L.latLng(pt.lat, pt.lng)));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
  }, []);

  const handleDemoRoute = () => {
    if (!riderPosition) return;
    setPickingDestination(false);
    const built = buildDemoRoute(
      { lat: riderPosition.latitude, lng: riderPosition.longitude },
      potholes
    );
    if (built.points.length >= 2) {
      setRoute(built);
      setRouteMode('demo');
      fitRouteBounds(built);
    }
  };

  const handleTogglePick = () => {
    setPickingDestination((prev) => !prev);
  };

  const handleClearRoute = () => {
    setRoute(null);
    setRouteMode(null);
    setPickingDestination(false);
  };

  // Initialize Leaflet map when GPS is available
  useEffect(() => {
    if (!riderPosition || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [riderPosition.latitude, riderPosition.longitude],
      zoom: 16,
      zoomControl: false,
    });

    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    routeLayerRef.current = L.layerGroup().addTo(map);
    potholesLayerRef.current = L.layerGroup().addTo(map);
    riderLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (evt: L.LeafletMouseEvent) => {
      if (!pickingRef.current) return;
      const origin = riderRef.current;
      if (!origin) return;
      void getPointToPointRoute(
        { lat: origin.latitude, lng: origin.longitude },
        { lat: evt.latlng.lat, lng: evt.latlng.lng }
      ).then((built) => {
        if (built.points.length >= 2) {
          setRoute(built);
          setRouteMode('picked');
          setPickingDestination(false);
          const bounds = L.latLngBounds(built.points.map((pt) => L.latLng(pt.lat, pt.lng)));
          map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
        }
      });
    });

    mapRef.current = map;

    const raf = window.requestAnimationFrame(() => map.invalidateSize());
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    const containerEl = mapContainerRef.current;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && containerEl
        ? new ResizeObserver(() => map.invalidateSize())
        : null;
    if (resizeObserver && containerEl) resizeObserver.observe(containerEl);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      potholesLayerRef.current = null;
      riderLayerRef.current = null;
    };
  }, [riderPosition !== null]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const raf = window.requestAnimationFrame(() => map.invalidateSize());
    const timer = window.setTimeout(() => map.invalidateSize(), 60);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [pickingDestination]);

  // Render rider marker
  useEffect(() => {
    const layer = riderLayerRef.current;
    if (!layer) return;
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
  }, [riderPosition]);

  // Render simulated route polyline & destination pin
  useEffect(() => {
    const layer = routeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!route || route.points.length < 2) return;

    const latLngs: [number, number][] = route.points.map((pt) => [pt.lat, pt.lng]);
    L.polyline(latLngs, {
      color: '#006B5F',
      weight: 5,
      opacity: 0.9,
      dashArray: '10, 8',
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layer);

    const dest = latLngs[latLngs.length - 1];
    const destIcon = L.divIcon({
      className: 'terra-route-dest',
      html: `<div style="width:22px;height:22px;border-radius:9999px;background:#111827;border:3px solid #FFFFFF;box-shadow:0 2px 8px rgba(17,24,39,0.45);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;border-radius:9999px;background:#FACC15;"></div></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    L.marker(dest, { icon: destIcon, zIndexOffset: 900 })
      .bindTooltip('Simulated destination', { direction: 'top' })
      .addTo(layer);
  }, [route, riderPosition !== null]);

  // Render confirmed pothole markers
  useEffect(() => {
    const layer = potholesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const pothole of potholes) {
      if (!pothole.gpsReliable || pothole.latitude === null || pothole.longitude === null) continue;
      const active = isActiveHazard(pothole);
      const highlighted = route ? active && nearRouteIds.has(pothole.eventId) : active;
      const style = getMarkerStyle(pothole);
      const letter = style.label === 'REPAIRED' ? 'R' : style.label === 'N/A' ? '?' : style.label.slice(0, 1);
      const opacity = route ? (highlighted ? 1 : 0.3) : active ? 1 : 0.4;
      const size = route && !highlighted ? 26 : 34;
      const safeRoad = formatRoadName(pothole.roadName).replace(/"/g, '&quot;');

      const icon = L.divIcon({
        className: 'terra-pothole-marker',
        html: `<button type="button" aria-label="${style.label} pothole on ${safeRoad}" style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;padding:0;cursor:pointer;opacity:${opacity};"><span style="width:${size}px;height:${size}px;border-radius:9999px;background:${style.bgHex};color:${style.textHex};border:3px solid #FFFFFF;box-shadow:0 3px 10px rgba(17,24,39,0.3);display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:12px;">${letter}</span></button>`,
        iconSize: [56, 56],
        iconAnchor: [28, 28],
      });

      const marker = L.marker([pothole.latitude, pothole.longitude], {
        icon,
        zIndexOffset: highlighted ? 500 : 100,
      });
      marker.on('click', () => setSelectedPothole(pothole));
      marker.addTo(layer);
    }
  }, [potholes, route, nearRouteIds, setSelectedPothole, riderPosition !== null]);

  const handleCenterGps = () => {
    if (mapRef.current && riderPosition) {
      mapRef.current.flyTo([riderPosition.latitude, riderPosition.longitude], 16);
    }
  };

  const waitingForFirstFix = gpsState === 'initializing' && !riderPosition;

  return (
    <div
      style={{
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))',
      }}
      className="mx-auto w-full max-w-5xl space-y-5 px-4 md:px-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#111827] sm:text-[28px]">
            Route
          </h1>
          {route && route.source === 'simulated' && (
            <span
              role="status"
              aria-label="Simulated route active"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#3B82F6] px-3 py-1 text-[11px] font-bold tracking-[0.06em] text-white uppercase shadow-sm whitespace-nowrap"
            >
              <RouteIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>SIMULATED ROUTE</span>
            </span>
          )}
        </div>
        <GpsStatusPill compact />
      </header>

      <LiveSyncPill />

      <section
        aria-label="Simulated route map"
        className="neu-raised-1 overflow-hidden rounded-3xl p-3"
      >
        {pickingDestination && (
          <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold text-[#006B5F]">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Tap the map to choose a destination</span>
          </p>
        )}

        {riderPosition ? (
          <div
            className={`relative z-0 h-[320px] w-full overflow-hidden rounded-2xl bg-[#E6EBF2] sm:h-[380px] ${
              pickingDestination ? 'terra-pick-cursor' : ''
            }`}
          >
            <div
              ref={mapContainerRef}
              className="terra-routemap h-[320px] w-full sm:h-[380px]"
              aria-label="Route hazard map"
            />
            <div
              role="group"
              aria-label="Route map zoom controls"
              className="pointer-events-auto absolute right-3 top-1/2 z-[1000] flex -translate-y-1/2 flex-col overflow-hidden rounded-2xl neu-raised-2 bg-[#E6EBF2]"
            >
              <button
                type="button"
                onClick={() => mapRef.current?.zoomIn()}
                aria-label="Zoom in"
                className="flex h-14 w-14 min-h-[56px] min-w-[56px] items-center justify-center border-b border-[#C2C9D6]/70 text-[#111827] transition-colors active:bg-[#D5DCE8]"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => mapRef.current?.zoomOut()}
                aria-label="Zoom out"
                className="flex h-14 w-14 min-h-[56px] min-w-[56px] items-center justify-center text-[#111827] transition-colors active:bg-[#D5DCE8]"
              >
                <Minus className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleCenterGps}
              aria-label="Center route map on your GPS location"
              className="pointer-events-auto neu-teal absolute bottom-3 right-3 z-[1000] inline-flex min-h-[56px] items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white transition-transform active:scale-95"
            >
              <Crosshair className="h-4 w-4" aria-hidden="true" />
              <span>My GPS</span>
            </button>
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl p-6 text-center">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${
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
            <h2 className="mt-4 font-display text-lg font-bold text-[#111827]">
              {waitingForFirstFix
                ? 'Waiting for location'
                : gpsState === 'denied'
                  ? 'Location permission denied'
                  : 'Location unavailable'}
            </h2>
            <p className="mt-1.5 max-w-md text-sm font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
              {gpsError ??
                'Route previews start from your live GPS location. Enable location access to continue.'}
            </p>
            {!waitingForFirstFix && gpsState !== 'unsupported' && (
              <button
                type="button"
                onClick={retryGps}
                className="neu-btn-slate mt-4 inline-flex min-h-[56px] items-center justify-center rounded-full px-6 py-3 font-display text-sm font-bold text-[#006B5F]"
              >
                Retry location access
              </button>
            )}
          </div>
        )}

        <p className="mt-2.5 px-1 text-xs font-semibold text-[#1F2937] whitespace-normal break-words">
          Dashed line shows a simulated path for testing only — it does not follow real roads.
        </p>
      </section>

      <section aria-label="Route controls" className="neu-raised-1 rounded-3xl p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            disabled={!riderPosition}
            onClick={handleDemoRoute}
            className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full px-5 py-3 font-display text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-50 ${
              routeMode === 'demo' ? 'neu-teal text-white' : 'neu-btn-slate text-[#111827]'
            }`}
          >
            <Navigation className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Demo route</span>
          </button>

          <button
            type="button"
            disabled={!riderPosition}
            onClick={handleTogglePick}
            aria-pressed={pickingDestination}
            className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full px-5 py-3 font-display text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-50 ${
              pickingDestination
                ? 'neu-teal text-white'
                : routeMode === 'picked'
                  ? 'neu-inset-sm text-[#006B5F]'
                  : 'neu-btn-slate text-[#111827]'
            }`}
          >
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Pick destination</span>
          </button>

          <button
            type="button"
            disabled={!route && !pickingDestination}
            onClick={handleClearRoute}
            className="neu-btn-slate inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full px-5 py-3 font-display text-sm font-bold text-[#111827] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Clear route</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-[#1F2937]">
            Route buffer width
          </span>
          <div role="group" aria-label="Route buffer distance" className="flex flex-wrap gap-2">
            {BUFFER_OPTIONS.map((opt) => {
              const active = bufferMeters === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setBufferMeters(opt)}
                  aria-pressed={active}
                  className={`min-h-[56px] rounded-full px-5 py-2 font-display text-sm font-bold tabular-nums transition-all ${
                    active ? 'neu-inset-sm text-[#006B5F]' : 'neu-raised-1 text-[#1F2937]'
                  }`}
                >
                  {opt} m
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-label="Route hazard summary" className="neu-raised-1 rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-[#111827]">Route Hazard Summary</h2>
          {route && (
            <span className="text-xs font-bold tabular-nums text-[#1F2937]">
              {formatDistance(route.distanceMeters)} · ~{formatDurationMinutes(route.durationSeconds)}
            </span>
          )}
        </div>

        {!route || !analysis ? (
          <div className="neu-inset-sm mt-4 rounded-2xl p-4 text-sm font-medium text-[#1F2937]">
            Choose <strong>Demo route</strong> or toggle <strong>Pick destination</strong> and tap
            the map to inspect reported potholes along a simulated path.
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="neu-inset-sm rounded-2xl p-3.5 text-center">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F2937]">
                  Total Near Route
                </div>
                <div className="mt-1 font-display text-2xl font-bold tabular-nums text-[#111827]">
                  {analysis.totalCount}
                </div>
              </div>
              <div className="neu-inset-sm rounded-2xl p-3.5 text-center">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#DC2626]">
                  Critical
                </div>
                <div className="mt-1 font-display text-2xl font-bold tabular-nums text-[#DC2626]">
                  {analysis.severityCounts.CRITICAL}
                </div>
              </div>
              <div className="neu-inset-sm rounded-2xl p-3.5 text-center">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#C2410C]">
                  High
                </div>
                <div className="mt-1 font-display text-2xl font-bold tabular-nums text-[#C2410C]">
                  {analysis.severityCounts.HIGH}
                </div>
              </div>
            </div>

            {analysis.affectedSections.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.06em] text-[#1F2937]">
                  Affected sections
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysis.affectedSections.map((sec, idx) => (
                    <div
                      key={`${sec.roadName}-${idx}`}
                      className="neu-inset-sm rounded-2xl px-3.5 py-2 text-xs font-semibold text-[#111827]"
                    >
                      <span>{sec.roadName}</span>
                      <span className="mx-1.5 text-[#6B7280]" aria-hidden="true">
                        ·
                      </span>
                      <span className="tabular-nums">
                        {sec.hazardCount} {sec.hazardCount === 1 ? 'hazard' : 'hazards'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.totalCount === 0 ? (
              <div className="neu-inset-sm mt-4 rounded-2xl p-4 text-center">
                <p className="font-display text-base font-bold text-[#111827]">
                  No reported potholes near this route
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2.5" aria-label="Potholes along route">
                {analysis.hazards.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedPothole(item.pothole)}
                      className="neu-raised-1 flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-transform active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={item.severity} size="sm" />
                          <span className="font-display text-sm font-bold tabular-nums text-[#006B5F]">
                            {formatDistance(item.distanceAlongRouteMeters)} from start
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-[#111827]">
                          {item.roadName}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-[#1F2937]">
                        {Math.round(item.distanceFromRouteMeters)} m off line
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div
          aria-disabled="true"
          className="neu-inset-sm mt-4 flex min-h-[56px] items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-[#6B7280] opacity-75"
        >
          <span>Alternative routes: needs a routing provider</span>
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        </div>

        <p className="mt-4 text-xs font-medium leading-relaxed text-[#1F2937] whitespace-normal break-words">
          Based on reported data only. No reported potholes does not mean the road is in good
          condition.
        </p>
      </section>
    </div>
  );
};

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchServerPotholesSnapshot,
  subscribeToDevicesRealtime,
  subscribeToPotholesRealtime,
} from '../services/firestoreRepository';
import { locationService, LocationServiceError } from '../services/locationService';
import type {
  DeviceRecord,
  GpsState,
  PotholeRecord,
  RiderPosition,
  SystemAlertRecord,
} from '../types/terra';
import { RepositoryError } from '../types/terra';
import { useAuth } from './AuthContext';

function useNavigatorOnline(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  return isOnline;
}

interface AppDataContextValue {
  potholes: PotholeRecord[];
  devices: DeviceRecord[];
  systemAlerts: SystemAlertRecord[];
  isLoading: boolean;
  fromCache: boolean;
  hasServerSnapshot: boolean;
  hasEarlierData: boolean;
  lastServerSyncAt: number | null;
  droppedCount: number;
  dataError: RepositoryError | null;
  isOnline: boolean;
  refreshData: () => Promise<void>;
  riderPosition: RiderPosition | null;
  gpsState: GpsState;
  gpsError: string | null;
  retryGps: () => void;
  selectedPothole: PotholeRecord | null;
  setSelectedPothole: (pothole: PotholeRecord | null) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();
  const isOnline = useNavigatorOnline();

  const [potholes, setPotholes] = useState<PotholeRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlertRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fromCache, setFromCache] = useState<boolean>(true);
  const [hasServerSnapshot, setHasServerSnapshot] = useState<boolean>(false);
  const [hasEarlierData, setHasEarlierData] = useState<boolean>(false);
  const [lastServerSyncAt, setLastServerSyncAt] = useState<number | null>(null);
  const [droppedCount, setDroppedCount] = useState<number>(0);
  const [dataError, setDataError] = useState<RepositoryError | null>(null);
  const [resubToken, setResubToken] = useState<number>(0);

  const [selectedPotholeId, setSelectedPotholeId] = useState<string | null>(null);

  const [riderPosition, setRiderPosition] = useState<RiderPosition | null>(null);
  const [gpsState, setGpsState] = useState<GpsState>('initializing');
  const [gpsError, setGpsError] = useState<string | null>('Waiting for location');
  const [gpsRetryToken, setGpsRetryToken] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  // Derive selectedPothole directly from live potholes array so edits & deletions reflect instantly
  const selectedPothole = useMemo(() => {
    if (!selectedPotholeId) return null;
    return potholes.find((p) => p.eventId === selectedPotholeId) ?? null;
  }, [potholes, selectedPotholeId]);

  const setSelectedPothole = useCallback((pothole: PotholeRecord | null) => {
    setSelectedPotholeId(pothole ? pothole.eventId : null);
  }, []);

  // Attach real-time Firestore onSnapshot listeners only when authenticated
  useEffect(() => {
    if (!user) {
      setPotholes([]);
      setDevices([]);
      setSystemAlerts([]);
      setDataError(null);
      setDroppedCount(0);
      setFromCache(true);
      setHasServerSnapshot(false);
      setHasEarlierData(false);
      setLastServerSyncAt(null);
      setSelectedPotholeId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setDataError(null);

    const unsubPotholes = subscribeToPotholesRealtime(
      (payload) => {
        setPotholes(payload.potholes);
        setFromCache(payload.fromCache);
        setDroppedCount(payload.droppedCount);
        setDataError(null);
        if (payload.fromCache) {
          if (payload.potholes.length > 0) setHasEarlierData(true);
        } else {
          setHasServerSnapshot(true);
          setHasEarlierData(true);
          if (payload.syncedAt !== null) {
            setLastServerSyncAt(payload.syncedAt);
          }
        }
        setIsLoading(false);
      },
      (error) => {
        setDataError(error);
        setIsLoading(false);
      }
    );

    const unsubDevices = subscribeToDevicesRealtime((nextDevices) => {
      setDevices(nextDevices);
    });

    return () => {
      unsubPotholes();
      unsubDevices();
    };
  }, [user, resubToken]);

  const refreshData = useCallback(async () => {
    if (!user) return;
    if (dataError !== null || !hasServerSnapshot) {
      setIsLoading(true);
      setDataError(null);
      setResubToken((t) => t + 1);
      return;
    }
    setIsLoading(true);
    setDataError(null);
    try {
      const snap = await fetchServerPotholesSnapshot();
      setPotholes(snap.potholes);
      setFromCache(snap.fromCache);
      setDroppedCount(snap.droppedCount);
      if (!snap.fromCache) {
        setHasServerSnapshot(true);
        setHasEarlierData(true);
        if (snap.syncedAt !== null) setLastServerSyncAt(snap.syncedAt);
      }
    } catch (error) {
      setDataError(
        error instanceof RepositoryError
          ? error
          : new RepositoryError('unknown', 'Unexpected error refreshing Firestore data.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [user, dataError, hasServerSnapshot]);

  // Document visibility lifecycle
  useEffect(() => {
    const onVisibility = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (!visible) void locationService.stopWatching();
    };
    const onPageHide = () => {
      setIsVisible(false);
      void locationService.stopWatching();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  const handleGpsError = useCallback((err: LocationServiceError) => {
    if (err.code === 'denied') {
      setGpsState('denied');
      setGpsError(
        'Location permission denied. Enable location access in your browser or device settings.'
      );
      setRiderPosition(null);
    } else if (err.code === 'timeout') {
      setGpsState('timeout');
      setGpsError('Location unavailable — GPS timed out while waiting for first fix.');
    } else if (err.code === 'unsupported') {
      setGpsState('unsupported');
      setGpsError('Location unavailable — geolocation is not supported on this device.');
      setRiderPosition(null);
    } else {
      setGpsState('unavailable');
      setGpsError('Location unavailable — GPS coordinates could not be determined.');
    }
  }, []);

  const retryGps = useCallback(() => {
    setGpsState('initializing');
    setGpsError('Waiting for location');
    void locationService.requestPermission().then((status) => {
      if (status === 'denied') {
        setGpsState('denied');
        setGpsError(
          'Location permission denied. Enable location access in your browser or device settings.'
        );
        setRiderPosition(null);
      } else {
        setGpsRetryToken((t) => t + 1);
      }
    });
  }, []);

  const needsContinuousWatch = location.pathname === '/map' || location.pathname === '/ride';

  useEffect(() => {
    if (!user || !isVisible) {
      void locationService.stopWatching();
      return;
    }

    let cancelled = false;

    if (needsContinuousWatch) {
      if (!riderPosition) {
        setGpsState('initializing');
        setGpsError('Waiting for location');
      }
      void locationService.watchPosition(
        (pos, err) => {
          if (cancelled) return;
          if (err) {
            handleGpsError(err);
          } else if (pos) {
            setRiderPosition(pos);
            setGpsState('active');
            setGpsError(null);
          }
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 3000 }
      );
      return () => {
        cancelled = true;
        void locationService.stopWatching();
      };
    }

    void locationService.stopWatching();
    if (!riderPosition) {
      setGpsState('initializing');
      setGpsError('Waiting for location');
    }
    void locationService
      .getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
      .then((pos) => {
        if (cancelled) return;
        setRiderPosition(pos);
        setGpsState('active');
        setGpsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof LocationServiceError) {
          handleGpsError(err);
        } else {
          setGpsState('unavailable');
          setGpsError('Location unavailable.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, isVisible, needsContinuousWatch, gpsRetryToken, handleGpsError]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      potholes,
      devices,
      systemAlerts,
      isLoading,
      fromCache,
      hasServerSnapshot,
      hasEarlierData,
      lastServerSyncAt,
      droppedCount,
      dataError,
      isOnline,
      refreshData,
      riderPosition,
      gpsState,
      gpsError,
      retryGps,
      selectedPothole,
      setSelectedPothole,
    }),
    [
      potholes,
      devices,
      systemAlerts,
      isLoading,
      fromCache,
      hasServerSnapshot,
      hasEarlierData,
      lastServerSyncAt,
      droppedCount,
      dataError,
      isOnline,
      refreshData,
      riderPosition,
      gpsState,
      gpsError,
      retryGps,
      selectedPothole,
      setSelectedPothole,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used inside AppDataProvider');
  }
  return ctx;
}

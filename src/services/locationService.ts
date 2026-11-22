import type { RiderPosition } from '../types/terra';

export class LocationServiceError extends Error {
  code: 'denied' | 'timeout' | 'unavailable' | 'unsupported';

  constructor(code: 'denied' | 'timeout' | 'unavailable' | 'unsupported', message: string) {
    super(message);
    this.name = 'LocationServiceError';
    this.code = code;
  }
}

function toRiderPosition(pos: GeolocationPosition): RiderPosition {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    speedMps: pos.coords.speed ?? null,
    heading: pos.coords.heading ?? null,
    accuracyMeters: pos.coords.accuracy ?? null,
    updatedAt: pos.timestamp || Date.now(),
  };
}

function mapGeoError(err: GeolocationPositionError): LocationServiceError {
  if (err.code === err.PERMISSION_DENIED) {
    return new LocationServiceError(
      'denied',
      'Location permission was denied. Enable location access in your browser or device settings to measure distance from your position.'
    );
  }
  if (err.code === err.TIMEOUT) {
    return new LocationServiceError(
      'timeout',
      'Location unavailable — GPS timed out while waiting for first fix.'
    );
  }
  return new LocationServiceError(
    'unavailable',
    'Location unavailable — GPS coordinates could not be determined on this device.'
  );
}

class WebLocationService {
  private watchId: number | null = null;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  async getCurrentPosition(options?: PositionOptions): Promise<RiderPosition> {
    if (!this.isSupported()) {
      throw new LocationServiceError(
        'unsupported',
        'Location unavailable — geolocation is not supported on this device.'
      );
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(toRiderPosition(pos)),
        (err) => reject(mapGeoError(err)),
        {
          enableHighAccuracy: options?.enableHighAccuracy ?? false,
          timeout: options?.timeout ?? 12000,
          maximumAge: options?.maximumAge ?? 5000,
        }
      );
    });
  }

  async watchPosition(
    callback: (pos: RiderPosition | null, error?: LocationServiceError) => void,
    options?: PositionOptions
  ): Promise<void> {
    await this.stopWatching();
    if (!this.isSupported()) {
      callback(
        null,
        new LocationServiceError(
          'unsupported',
          'Location unavailable — geolocation is not supported on this device.'
        )
      );
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => callback(toRiderPosition(pos)),
      (err) => callback(null, mapGeoError(err)),
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 12000,
        maximumAge: options?.maximumAge ?? 3000,
      }
    );
  }

  async stopWatching(): Promise<void> {
    if (this.watchId !== null && this.isSupported()) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  async getPermissionStatus(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (!this.isSupported()) return 'unsupported';
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
      return 'prompt';
    }
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state === 'granted' || result.state === 'denied' || result.state === 'prompt'
        ? result.state
        : 'prompt';
    } catch {
      return 'prompt';
    }
  }

  async requestPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (!this.isSupported()) return 'unsupported';
    try {
      await this.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
      return 'granted';
    } catch (err) {
      if (err instanceof LocationServiceError && err.code === 'denied') {
        return 'denied';
      }
      return this.getPermissionStatus();
    }
  }
}

export const locationService = new WebLocationService();

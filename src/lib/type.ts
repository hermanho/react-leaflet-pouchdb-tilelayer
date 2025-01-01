import { LatLngBounds, TileLayerOptions } from 'leaflet';

export interface PouchDBTileLayerOptions extends TileLayerOptions {
  useCache?: boolean;
  saveToCache?: boolean;
  useOnlyCache?: boolean;
  cacheFormat?: string;
  cacheMaxAge?: number;
  cacheNextZoomLevel?: boolean;
  cacheEdgeTile?: number;
  useWorker?: boolean;
  debug?: boolean;
  debugOnUI?: boolean;
  profiling?: boolean;
}

export interface SeedData {
  bbox: LatLngBounds;
  minZoom: number;
  maxZoom: number;
  queueLength: number;
}

export interface OfflineTile {
  timestamp: number;
}

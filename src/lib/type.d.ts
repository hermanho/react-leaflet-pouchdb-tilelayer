import { LatLngBounds, TileLayerOptions } from "leaflet";

interface PouchDBTileLayerOptions {
  useCache?: boolean;
  saveToCache?: boolean;
  useOnlyCache?: boolean;
  cacheFormat?: string;
  cacheMaxAge?: number;
  cacheNextZoomLevel?: boolean;
  cacheEdgeTile?: number;
  debug?: bool;
}

type MergedPouchDBTileLayerOptions = PouchDBTileLayerOptions & TileLayerOptions;

interface SeedData {
  bbox: LatLngBounds;
  minZoom: number;
  maxZoom: number;
  queueLength: number;
}

interface OfflineTile {
  timestamp: number;
}

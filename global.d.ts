/// <reference types="leaflet" />

declare namespace L {
  export interface GridLayer {
    _clampZoom(zoom: number): number;
    _tileCoordsToBounds(coords: Coords): LatLngBounds;
    _pxBoundsToTileRange(bounds: Bounds): Bounds;
    _globalTileRange: Bounds;
  }
  export interface TileLayer {
    _getSubdomain(coords: Coords): string | string[];
    _url: string;
    src: string;
  }
}

declare module "web-worker:*" {
  const WokerFactory: new () => Worker;
  export default WokerFactory;
}

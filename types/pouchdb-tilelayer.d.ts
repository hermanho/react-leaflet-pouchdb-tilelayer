/// <reference types="pouchdb-find" />
/// <reference types="pouchdb-core" />
/// <reference types="pouchdb-mapreduce" />
/// <reference types="pouchdb-replication" />
import PouchDB from "pouchdb";
import { Bounds, Coords, DoneCallback, Point, LatLngBounds, LatLngExpression, TileLayer as LeafletTileLayer, TileLayerOptions } from "leaflet";
export interface PouchDBTileLayerOptions {
    useCache: boolean;
    saveToCache: boolean;
    useOnlyCache: boolean;
    cacheFormat: string;
    cacheMaxAge: number;
    cacheNextZoomLevel: boolean;
}
declare type MergedPouchDBTileLayerOptions = PouchDBTileLayerOptions & TileLayerOptions;
interface PointZ extends Point {
    z: number;
}
interface SeedData {
    bbox: LatLngBounds;
    minZoom: number;
    maxZoom: number;
    queueLength: number;
}
interface OfflineTile {
    _id: string;
    _rev: PouchDB.Core.RevisionId;
    timestamp: number;
}
export declare class LeafletPouchDBTileLayer extends LeafletTileLayer {
    _db?: PouchDB.Database<OfflineTile>;
    options: MergedPouchDBTileLayerOptions;
    constructor(urlTemplate: string, options?: MergedPouchDBTileLayerOptions);
    createTile(coords: Coords, done?: DoneCallback): HTMLImageElement;
    _onCacheLookup(tile: HTMLImageElement, tileUrl: string, done: DoneCallback): (data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta) => void | Promise<void>;
    _onCacheHit(tile: HTMLImageElement, tileUrl: string, data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta, done?: DoneCallback): Promise<void>;
    _onCacheMiss(tile: HTMLImageElement, tileUrl: string, done?: DoneCallback): void;
    _saveTile(tile: HTMLImageElement, tileUrl: string, existingRevision?: PouchDB.Core.RevisionId, done?: DoneCallback): void;
    _createTile(): HTMLImageElement;
    _getTileUrl(coords: PointZ): string;
    getTiledPixelBoundsByZoom(center: LatLngExpression, zoom: number): Bounds;
    seed(bbox: LatLngBounds, minZoom: number, maxZoom: number): Promise<void>;
    _seedOneTile(tile: HTMLImageElement, remaining: string[], seedData: SeedData): Promise<void>;
}
export {};

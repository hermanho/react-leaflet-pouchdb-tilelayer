/// <reference types="pouchdb-find" />
/// <reference types="pouchdb-core" />
/// <reference types="pouchdb-mapreduce" />
/// <reference types="pouchdb-replication" />
import PouchDB from "pouchdb";
import { Bounds, Coords, DoneCallback, LatLngBounds, LatLngExpression, TileLayer as LeafletTileLayer } from "leaflet";
import { MergedPouchDBTileLayerOptions, OfflineTile } from "../type";
export declare class LeafletPouchDBTileLayer extends LeafletTileLayer {
    _db?: PouchDB.Database<OfflineTile>;
    options: MergedPouchDBTileLayerOptions;
    constructor(urlTemplate: string, options?: MergedPouchDBTileLayerOptions);
    createTile(coords: Coords, done?: DoneCallback): HTMLImageElement;
    _onCacheLookup(tile: HTMLImageElement, tileUrl: string, done: DoneCallback): (data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta) => void;
    _onCacheHit(tile: HTMLImageElement, tileUrl: string, data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta, done?: DoneCallback): void;
    _onCacheMiss(tile: HTMLImageElement, tileUrl: string, done?: DoneCallback): void;
    _saveTile(tile: HTMLImageElement, tileUrl: string, existingRevision?: PouchDB.Core.RevisionId, done?: DoneCallback): void;
    _saveTileBlob(tileUrl: string, existingRevision?: PouchDB.Core.RevisionId): Promise<void>;
    _createTile(): HTMLImageElement;
    _getTileUrl(coords: Coords): string;
    getTiledPixelBoundsByZoom(center: LatLngExpression, zoom: number): Bounds;
    seed(bbox: LatLngBounds, minZoom: number, maxZoom: number): void;
    _seedOneTile(url: string): void;
}

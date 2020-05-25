/// <reference types="pouchdb-find" />
/// <reference types="pouchdb-core" />
/// <reference types="pouchdb-mapreduce" />
/// <reference types="pouchdb-replication" />
import PouchDB from "pouchdb-browser";
import * as Comlink from "comlink";
import { Bounds, Coords, DoneCallback, LatLngBounds, TileLayer as LeafletTileLayer } from "leaflet";
import { MergedPouchDBTileLayerOptions, OfflineTile } from "../type";
import { WorkerType } from "./worker/worker";
export declare class LeafletPouchDBTileLayer extends LeafletTileLayer {
    _db?: PouchDB.Database<OfflineTile>;
    options: MergedPouchDBTileLayerOptions;
    worker: Comlink.Remote<WorkerType>;
    constructor(urlTemplate: string, options?: MergedPouchDBTileLayerOptions);
    createTile(coords: Coords, done?: DoneCallback): HTMLImageElement;
    _onCacheLookup(tile: HTMLImageElement, tileUrl: string, done: DoneCallback): (data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta) => void;
    _onCacheHit(tile: HTMLImageElement, tileUrl: string, data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta, done?: DoneCallback): void;
    _onCacheMiss(tile: HTMLImageElement, tileUrl: string, done?: DoneCallback): void;
    _createTile(): HTMLImageElement;
    _getTileUrl(coords: Coords): string;
    seed(bbox: LatLngBounds, minZoom: number, maxZoom: number): void;
    seedBounds(tileRange: Bounds, z: number): void;
}

import PouchDB from "pouchdb-browser";
import * as Comlink from "comlink";
import {
  Bounds,
  Coords,
  DomEvent,
  DoneCallback,
  Point,
  Browser,
  LatLngBounds,
  TileLayer as LeafletTileLayer,
  Util,
} from "leaflet";
import { MergedPouchDBTileLayerOptions, OfflineTile } from "../type";
import { WorkerType } from "./worker/worker";
import WorkerCode from "./worker.embedded";

const workerBlob = new Blob([WorkerCode], { type: "text/javascript" });
const workerBlobURI = URL.createObjectURL(workerBlob);
console.debug(`workerBlobURI: ${workerBlobURI}`);

const worker = new Worker(workerBlobURI);

export class LeafletPouchDBTileLayer extends LeafletTileLayer {
  _db?: PouchDB.Database<OfflineTile>;
  options: MergedPouchDBTileLayerOptions;
  worker: Comlink.Remote<WorkerType>;

  constructor(urlTemplate: string, options?: MergedPouchDBTileLayerOptions) {
    super(urlTemplate, options);
    if (options.useCache) {
      this._db = new PouchDB("offline-tiles");
      this.worker = Comlink.wrap(worker);
    } else {
      this._db = null;
    }
  }

  // Overwrites L.TileLayer.prototype.createTile
  createTile(coords: Coords, done?: DoneCallback) {
    const tile = document.createElement("img");

    DomEvent.on(tile, "load", Util.bind(this._tileOnLoad, this, done, tile));
    DomEvent.on(tile, "error", Util.bind(this._tileOnError, this, done, tile));

    if (this.options.crossOrigin) {
      tile.crossOrigin = "";
    }

    /*
         Alt tag is *set to empty string to keep screen readers from reading URL and for compliance reasons
         http://www.w3.org/TR/WCAG20-TECHS/H67
         */
    tile.alt = "";

    const tileUrl = this.getTileUrl(coords);

    if (this.options.useCache) {
      this._db
        .get(
          tileUrl,
          // eslint-disable-next-line @typescript-eslint/camelcase
          { revs_info: true }
        )
        .then(this._onCacheLookup(tile, tileUrl, done))
        .catch((reason) => {
          if (reason && reason.status === 404) {
            this._onCacheMiss(tile, tileUrl, done);
          } else {
            console.log("Cannot get from PouchDB");
            console.error(reason);
            throw reason;
          }
        });
    } else {
      // Fall back to standard behaviour
      tile.src = tileUrl;
    }

    if (this.options.cacheNextZoomLevel) {
      setTimeout(() => {
        if (this._map) {
          const zoom = this._clampZoom(coords.z + 1);
          if (
            !(
              (this.options.maxZoom !== undefined &&
                zoom > this.options.maxZoom) ||
              (this.options.minZoom !== undefined &&
                zoom < this.options.minZoom)
            )
          ) {
            console.debug(`cacheNextZoomLevel => ${JSON.stringify(coords)}`);
            const tileBounds = this._tileCoordsToBounds(coords);
            this.seed(tileBounds, zoom, zoom);
          }
        }
      }, 1000);
    }

    // Cache edge tile
    // if (this.options.cacheEdgeTile && this.options.cacheEdgeTile > 0) {
    //   setTimeout(() => {
    //     if (this._map) {
    //       const tileRangeBounds = this._pxBoundsToTileRange(
    //         this._map.getPixelBounds()
    //       );
    //       const edge = this.options.cacheEdgeTile;
    //       const north = new Bounds(
    //         new Point(tileRangeBounds.min.x, tileRangeBounds.min.y - edge),
    //         new Point(tileRangeBounds.max.x, tileRangeBounds.min.y - 1)
    //       );
    //       const south = new Bounds(
    //         new Point(tileRangeBounds.min.x, tileRangeBounds.max.y + 1),
    //         new Point(tileRangeBounds.max.x, tileRangeBounds.max.y + edge)
    //       );
    //       const east = new Bounds(
    //         new Point(tileRangeBounds.max.x + 1, tileRangeBounds.min.y),
    //         new Point(tileRangeBounds.max.x + edge, tileRangeBounds.max.y)
    //       );
    //       const west = new Bounds(
    //         new Point(tileRangeBounds.min.x - edge, tileRangeBounds.min.y),
    //         new Point(tileRangeBounds.min.x - 1, tileRangeBounds.max.y)
    //       );
    //       this.seedBounds(north, this._map.getZoom());
    //       this.seedBounds(south, this._map.getZoom());
    //       this.seedBounds(east, this._map.getZoom());
    //       this.seedBounds(west, this._map.getZoom());
    //     }
    //   }, 1000);
    // }
    return tile;
  }

  // Returns a callback (closure over tile/key/originalSrc) to be run when the DB
  //   backend is finished with a fetch operation.
  _onCacheLookup(tile: HTMLImageElement, tileUrl: string, done: DoneCallback) {
    return (
      data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta
    ) => {
      if (data) {
        return this._onCacheHit(tile, tileUrl, data, done);
      } else {
        return this._onCacheMiss(tile, tileUrl, done);
      }
    };
  }

  _onCacheHit(
    tile: HTMLImageElement,
    tileUrl: string,
    data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta,
    done?: DoneCallback
  ) {
    this.fire("tilecachehit", {
      tile: tile,
      url: tileUrl,
    });

    const loadFromCache = async () => {
      // Serve tile from cached data
      // Read the attachment as blob
      const blob = await this._db.getAttachment(tileUrl, "tile");
      const url = URL.createObjectURL(blob);
      tile.src = url;
    };
    const loadFromCacheFn = Util.bind(loadFromCache, this);

    const _self = this;
    try {
      if (
        Date.now() > data.timestamp + this.options.cacheMaxAge &&
        !this.options.useOnlyCache
      ) {
        // Tile is too old, try to refresh it
        console.debug(
          `Tile is too old: ${tileUrl}, ${Date.now()} > ${data.timestamp}`
        );

        if (_self.options.saveToCache) {
          this.worker.saveTile(
            this.options.cacheFormat,
            true,
            tileUrl,
            data._revs_info[0].rev
          );
        }
        tile.crossOrigin = "Anonymous";
        tile.src = tileUrl;

        DomEvent.on(tile, "error", loadFromCacheFn);
      } else {
        loadFromCache();
      }
      return;
    } catch (reason) {
      if (reason && reason.status === 404) {
        _self._onCacheMiss(tile, tileUrl, done);
      } else {
        throw reason;
      }
    }
  }

  _onCacheMiss(tile: HTMLImageElement, tileUrl: string, done?: DoneCallback) {
    this.fire("tilecachemiss", {
      tile: tile,
      url: tileUrl,
    });
    if (this.options.useOnlyCache) {
      // Offline, not cached
      // 	console.log('Tile not in cache', tileUrl);
      // tile.onload = Util.falseFn;
      tile.src = Util.emptyImageUrl;
    } else {
      // Online, not cached, request the tile normally
      // console.log('Requesting tile normally', tileUrl);
      if (this.options.saveToCache) {
        this.worker.saveTile(this.options.cacheFormat, true, tileUrl);
      }
      tile.crossOrigin = "Anonymous";
      tile.src = tileUrl;
    }
    return;
  }

  // 'react-leaflet/TileLayer'
  _createTile() {
    return document.createElement("img");
  }

  // Modified L.TileLayer.getTileUrl, this will use the zoom given by the parameter coords
  //  instead of the maps current zoomlevel.
  // https://github.com/Leaflet/Leaflet/blob/1d09819922f592cd0fcdf37eb1fc263544a8bab6/src/layer/tile/TileLayer.js#L169
  _getTileUrl(coords: Coords) {
    let zoom = coords.z;
    if (this.options.zoomReverse) {
      zoom = this.options.maxZoom - zoom;
    }
    zoom += this.options.zoomOffset;
    const data = {
      r: Browser.retina ? "@2x" : "",
      s: this._getSubdomain(coords),
      x: coords.x,
      y: coords.y,
      z: zoom,
    };
    if (this._map && !this._map.options.crs.infinite) {
      const invertedY = this._globalTileRange.max.y - coords.y;
      if (this.options.tms) {
        data["y"] = invertedY;
      }
      data["-y"] = invertedY;
    }

    return Util.template(this._url, Util.extend(data, this.options));
  }

  // 🍂section PouchDB tile caching methods
  // 🍂method seed(bbox: LatLngBounds, minZoom: Number, maxZoom: Number): this
  // Starts seeding the cache given a bounding box and the minimum/maximum zoom levels
  // Use with care! This can spawn thousands of requests and flood tileservers!
  seed(bbox: LatLngBounds, minZoom: number, maxZoom: number) {
    if (!this.options.useCache) return;
    if (minZoom > maxZoom) return;
    if (!this._map) return;

    // const queue: string[] = [];
    let count = 0;

    for (let z = minZoom; z <= maxZoom; z++) {
      // Geo bbox to pixel bbox (as per given zoom level)...
      const northEastPoint = this._map.project(bbox.getNorthEast(), z);
      const southWestPoint = this._map.project(bbox.getSouthWest(), z);

      // Then to tile coords bounds, as per GridLayer
      // const pixelBounds = this._getTiledPixelBounds(new Bounds([northEastPoint, southWestPoint])
      // );
      const tileRange = this._pxBoundsToTileRange(
        new Bounds([northEastPoint, southWestPoint])
      );

      for (let j = tileRange.min.y; j <= tileRange.max.y; j++) {
        for (let i = tileRange.min.x; i <= tileRange.max.x; i++) {
          const point = new Point(i, j) as Coords;
          point.z = z;
          const url = this._getTileUrl(point);
          // queue.push(url);
          this.worker.saveTile(this.options.cacheFormat, false, url);
          count++;
        }
      }
    }
    console.debug(`seed loaded ${count}`);

    // const seedData: SeedData = {
    //   bbox: bbox,
    //   minZoom: minZoom,
    //   maxZoom: maxZoom,
    //   queueLength: queue.length,
    // };
    // this.fire("seedstart", seedData);

    // for (let i = 0; i < queue.length; i++) {
    //   this.fire("seedprogress", {
    //     bbox: seedData.bbox,
    //     minZoom: seedData.minZoom,
    //     maxZoom: seedData.maxZoom,
    //     queueLength: seedData.queueLength,
    //     remainingLength: queue.length - i,
    //   });

    //   this.worker.saveTile(this.options.cacheFormat, false, queue[i]);
    // }
    // this.fire("seedend", seedData);
  }

  seedBounds(tileRange: Bounds, z: number) {
    if (!this.options.useCache) return;
    if (!this._map) return;

    // const queue: string[] = [];
    let count = 0;

    for (let j = tileRange.min.y; j <= tileRange.max.y; j++) {
      for (let i = tileRange.min.x; i <= tileRange.max.x; i++) {
        const point = new Point(i, j) as Coords;
        point.z = z;
        const url = this._getTileUrl(point);
        // queue.push(url);
        this.worker.saveTile(this.options.cacheFormat, false, url);
        count++;
      }
    }

    console.debug(`seedBounds loaded ${count}`);

    // for (let i = 0; i < queue.length; i++) {
    //   this.worker.saveTile(this.options.cacheFormat, false, queue[i]);
    // }
  }
}

import PouchDB from "pouchdb-browser";
import * as Comlink from "comlink";
import {
  Map,
  Bounds,
  Coords,
  DomEvent,
  DoneCallback,
  Point,
  Browser,
  LatLngBounds,
  TileLayer as LeafletTileLayer,
  Util,
  TileEvent,
} from "leaflet";
import { PouchDBTileLayerOptions, OfflineTile } from "./type";
import { WorkerType } from "./worker/worker";
import WorkerCode from "./worker.embedded";
import retryUntilWritten from "./retry";

const workerBlob = new Blob([WorkerCode], { type: "text/javascript" });
const workerBlobURI = URL.createObjectURL(workerBlob);
console.debug(`workerBlobURI: ${workerBlobURI}`);

const workerSupport = typeof Worker !== "undefined";

const defaultOption: PouchDBTileLayerOptions = {
  useCache: true,
  saveToCache: true,
  useOnlyCache: false,
  cacheFormat: "image/png",
  cacheMaxAge: 1 * 3600 * 1000,
  cacheNextZoomLevel: true,
  useWorker: true,
};

export class LeafletPouchDBTileLayer extends LeafletTileLayer {
  _db?: PouchDB.Database<OfflineTile>;
  pouchDBOptions: PouchDBTileLayerOptions;
  _worker?: Worker;
  workerRemote: Comlink.Remote<WorkerType>;

  constructor(urlTemplate: string, options?: PouchDBTileLayerOptions) {
    super(urlTemplate, Object.assign({}, defaultOption, options));
    this.pouchDBOptions = Object.assign({}, defaultOption, options);

    this.on("tileunload", this.onTileUnload);

    if (this.pouchDBOptions.debug) {
      const debugStyleNode = document.createElement('style');
      debugStyleNode.innerHTML = `
      .debugContainerCSS {
        outline: 1px solid green;
        position: absolute;
        top: 0px;
        left: 0px;
        width: 100%;
        height: 100%;
      } 
      .debugMsgCSS {
        font-weight: bold;
        font-size: 10pt;
        color: green;
        overflow-wrap: break-word;
        padding: 5px;
      } `;
      document.getElementsByTagName('head')[0].appendChild(debugStyleNode);
    }
  }

  // Overwrites L.TileLayer.prototype.createTile
  createTile(coords: Coords, done?: DoneCallback) {
    const debugTile = document.createElement("div");
    const debugMsgContainer = document.createElement("div");
    const debugMsg = document.createElement("div");
    const imgTile = document.createElement("img");

    if (this.pouchDBOptions.debug) {
      debugMsgContainer.classList.add("debug");
      debugMsgContainer.classList.add("debugContainerCSS");
      debugMsg.classList.add("debug");
      debugMsg.classList.add("debugMsgCSS");
      debugMsg.innerHTML = [coords.z, coords.x, coords.y].join("/");

      debugMsgContainer.appendChild(debugMsg);
      debugTile.appendChild(imgTile);
      debugTile.appendChild(debugMsgContainer);
      imgTile.style.position = "absolute";
      imgTile.style.top = "0px";
      imgTile.style.left = "0px";
    }

    DomEvent.on(
      imgTile,
      "load",
      Util.bind(this._tileOnLoad, this, done, imgTile)
    );
    DomEvent.on(
      imgTile,
      "error",
      Util.bind(this._tileOnError, this, done, imgTile)
    );

    if (this.options.crossOrigin) {
      imgTile.crossOrigin = "";
    }

    /*
         Alt tag is *set to empty string to keep screen readers from reading URL and for compliance reasons
         http://www.w3.org/TR/WCAG20-TECHS/H67
         */
    imgTile.alt = "";

    const tileUrl = this.getTileUrl(coords);

    if (this.pouchDBOptions.useCache) {
      (async () => {
        let cacheDone = false;
        setTimeout(() => {
          if (!cacheDone) {
            imgTile.src = tileUrl;
          }
        }, 500);
        try {
          const data = await this._db
            .get(
              tileUrl,
              { revs_info: true }
            )
          await this._onCacheLookup(data, imgTile, debugMsg, tileUrl);
          cacheDone = true;
        } catch (reason) {
          imgTile.src = tileUrl;
          if (reason && reason.status === 404) {
            this._onCacheMiss(imgTile, debugMsg, tileUrl);
          } else {
            console.log("Cannot get from PouchDB");
            console.error(reason);
            throw reason;
          }
        }
      })();

    } else {
      imgTile.src = tileUrl;
    }

    if (this.pouchDBOptions.cacheNextZoomLevel) {
      // Prevent deadlock in pouchdb (409)
      const randomSleep = Math.floor(Math.random() * 5000);
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
            // console.debug(`cacheNextZoomLevel => ${JSON.stringify(coords)}`);
            if (this.pouchDBOptions.debug) {
              // const j = JSON.stringify(coords);
              debugMsg.innerHTML += `, cacheNextZoomLevel (${zoom})`;
            }
            const tileBounds = this._tileCoordsToBounds(coords);
            this.seed(tileBounds, zoom, zoom);
          }
        }
      }, randomSleep);
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
    if (this.pouchDBOptions.debug) {
      return debugTile;
    } else {
      return imgTile;
    }
  }

  // Returns a callback (closure over tile/key/originalSrc) to be run when the DB
  //   backend is finished with a fetch operation.
  _onCacheLookup(
    data: OfflineTile & PouchDB.Core.IdMeta & PouchDB.Core.GetMeta,
    tile: HTMLImageElement,
    debugMsg: HTMLDivElement,
    tileUrl: string
  ) {
    if (data) {
      return this._onCacheHit(tile, debugMsg, tileUrl, data);
    } else {
      return this._onCacheMiss(tile, debugMsg, tileUrl);
    }
  }

  async _onCacheHit(
    tile: HTMLImageElement,
    debugMsg: HTMLDivElement,
    tileUrl: string,
    data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta,
  ) {
    this.fire("tilecachehit", {
      tile: tile,
      url: tileUrl,
    });
    if (this.pouchDBOptions.debug) {
      debugMsg.innerHTML += ", _onCacheHit";
    }
    const t0 = performance.now();

    try {
      if (
        Date.now() > data.timestamp + this.pouchDBOptions.cacheMaxAge &&
        !this.pouchDBOptions.useOnlyCache
      ) {
        // Tile is too old, try to refresh it
        if (this.pouchDBOptions.debug) {
          console.debug(
            `Tile is too old: ${tileUrl}, ${Date.now()} > ${data.timestamp}`
          );
          debugMsg.style.color = "orange";
          debugMsg.innerHTML += `, too old(${new Date(data.timestamp)})`;
        }

        if (this.pouchDBOptions.saveToCache) {
          this.saveTile(
            this.pouchDBOptions.cacheFormat,
            true,
            tileUrl,
            data._revs_info[0].rev
          );
        }
        const t1 = performance.now();
        if (this.pouchDBOptions.debug) {
          debugMsg.innerHTML +=
            `, ${tileUrl} took ${t1 - t0} milliseconds.`
        }
        tile.crossOrigin = "Anonymous";
        tile.src = tileUrl;
        return tileUrl;
      } else {
        if (this.pouchDBOptions.debug) {
          debugMsg.style.color = "green";
          debugMsg.innerHTML += ", loadFromCache";
        }
        const newSrc = await this._db.getAttachment(tileUrl, "tile").then((blob) => {
          const url = URL.createObjectURL(blob as Blob);
          tile.src = url;
          const t1 = performance.now();
          if (this.pouchDBOptions.debug) {
            debugMsg.innerHTML +=
              `,getAttachment ${tileUrl} took ${Math.ceil(t1 - t0)} milliseconds.`
          }
          return url;
        });
        return newSrc;
      }
    } catch (reason) {
      if (reason && reason.status === 404) {
        return this._onCacheMiss(tile, debugMsg, tileUrl);
      } else {
        throw reason;
      }
    }
  }

  _onCacheMiss(
    tile: HTMLImageElement,
    debugMsg: HTMLDivElement,
    tileUrl: string,
  ) {
    this.fire("tilecachemiss", {
      tile: tile,
      url: tileUrl,
    });

    if (this.pouchDBOptions.debug) {
      debugMsg.style.color = "white";
      debugMsg.innerHTML += ", _onCacheMiss";
    }

    let src = '';

    if (this.pouchDBOptions.useOnlyCache) {
      // Offline, not cached
      // 	console.log('Tile not in cache', tileUrl);
      // tile.onload = Util.falseFn;
      src = Util.emptyImageUrl;
    } else {
      // Online, not cached, request the tile normally
      // console.log('Requesting tile normally', tileUrl);
      if (this.pouchDBOptions.saveToCache) {
        this.saveTile(this.pouchDBOptions.cacheFormat, true, tileUrl);
      }
      tile.crossOrigin = "Anonymous";
      src = tileUrl;
    }
    // tile.src = src;
    return src;
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

  saveTile(
    format: string,
    override: boolean,
    tileUrl: string,
    existingRevision?: string
  ) {
    if (this.workerRemote) {
      this.workerRemote.saveTile(format, override, tileUrl, existingRevision);
      return;
    } else {
      (async () => {
        const t0 = performance.now();
        try {
          if (!override) {
            try {
              const data = await this._db.get(tileUrl);
              if (data) {
                return;
              }
            } catch {
              //
            }
          }
          this.pouchDBOptions.debug &&
            console.debug(`No data for ${tileUrl} in _seedOneTile`);
          const response = await fetch(tileUrl);
          const blob = await response.blob();
          this.pouchDBOptions.debug &&
            console.debug(`saveTileBlobThread: Saving ${tileUrl}`);

          await retryUntilWritten(this._db, {
            _id: tileUrl,
            _rev: existingRevision,
            timestamp: Date.now(),
            _attachments: {
              tile: {
                content_type: format,
                data: blob,
              },
            },
          });
          const t1 = performance.now();
          this.pouchDBOptions.debug && console.debug(`${tileUrl}: Done`);
          this.pouchDBOptions.profiling &&
            console.log(
              `inline saveTile ${tileUrl} took ${t1 - t0} milliseconds.`
            );
        } catch (err) {
          console.error(err);
        }
      })();
    }
  }

  // 🍂section PouchDB tile caching methods
  // 🍂method seed(bbox: LatLngBounds, minZoom: Number, maxZoom: Number): this
  // Starts seeding the cache given a bounding box and the minimum/maximum zoom levels
  // Use with care! This can spawn thousands of requests and flood tileservers!
  seed(bbox: LatLngBounds, minZoom: number, maxZoom: number) {
    if (!this.pouchDBOptions.useCache) return;
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
          this.saveTile(this.pouchDBOptions.cacheFormat, false, url);
          count++;
        }
      }
    }
    this.pouchDBOptions.debug && console.debug(`seed loaded ${count}`);

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
    if (!this.pouchDBOptions.useCache) return;
    if (!this._map) return;

    // const queue: string[] = [];
    let count = 0;

    for (let j = tileRange.min.y; j <= tileRange.max.y; j++) {
      for (let i = tileRange.min.x; i <= tileRange.max.x; i++) {
        const point = new Point(i, j) as Coords;
        point.z = z;
        const url = this._getTileUrl(point);
        // queue.push(url);
        this.saveTile(this.pouchDBOptions.cacheFormat, false, url);
        count++;
      }
    }

    this.pouchDBOptions.debug && console.debug(`seedBounds loaded ${count}`);

    // for (let i = 0; i < queue.length; i++) {
    //   this.worker.saveTile(this.pouchDBOptions.cacheFormat, false, queue[i]);
    // }
  }

  onTileUnload(e: TileEvent) {
    let imgSrc = (e.tile as HTMLImageElement).src;
    if (this.pouchDBOptions.debug) {
      imgSrc = e.tile.querySelector("img").src;
    }
    if (imgSrc && imgSrc.startsWith("blob:")) {
      URL.revokeObjectURL(imgSrc);
    }
  }

  onAdd(map: Map): this {
    if (this.pouchDBOptions.useCache) {
      this._db = new PouchDB("offline-tiles");
      this._worker = workerSupport ? new Worker(workerBlobURI) : null;
      this.workerRemote = this._worker && this.pouchDBOptions.useWorker && Comlink.wrap(this._worker);
      if (this.workerRemote) {
        this.workerRemote.setDebug(this.pouchDBOptions.debug);
        this.workerRemote.setProfiling(this.pouchDBOptions.profiling);
      }
      if (workerSupport && !this._worker && this.pouchDBOptions.useWorker) {
        console.warn('something wrong that cannot create worker 😣')
      }
    } else {
      this._db = null;
    }
    super.onAdd(map);
    return this;
  }

  onRemove(map: Map) {
    super.onRemove(map);
    this._worker?.terminate();
    this._worker = null;
    this.workerRemote = null;
    this._db.close();
    this._db = null;
    return this;
  }
}

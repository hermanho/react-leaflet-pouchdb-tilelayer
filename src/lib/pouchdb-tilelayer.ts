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
  TileEvent,
} from "leaflet";
import { MergedPouchDBTileLayerOptions, OfflineTile } from "./type";
import { WorkerType } from "./worker/worker";
import WorkerCode from "./worker.embedded";
import retryUntilWritten from "./retry";

const workerBlob = new Blob([WorkerCode], { type: "text/javascript" });
const workerBlobURI = URL.createObjectURL(workerBlob);
console.debug(`workerBlobURI: ${workerBlobURI}`);

const workerSupport = typeof Worker !== "undefined";

const worker = workerSupport ? new Worker(workerBlobURI) : null;

export class LeafletPouchDBTileLayer extends LeafletTileLayer {
  _db?: PouchDB.Database<OfflineTile>;
  pouchDBOptions: MergedPouchDBTileLayerOptions;
  worker: Comlink.Remote<WorkerType>;

  constructor(urlTemplate: string, options?: MergedPouchDBTileLayerOptions) {
    super(urlTemplate, options);
    this.pouchDBOptions = options;
    if (options.useCache) {
      this._db = new PouchDB("offline-tiles");
      this.worker = worker && options.useWorker && Comlink.wrap(worker);
      if (this.worker) {
        this.worker.setDebug(options.debug);
      }
    } else {
      this._db = null;
    }

    this.on("tileunload", this.onTileUnload);
  }

  // Overwrites L.TileLayer.prototype.createTile
  createTile(coords: Coords, done?: DoneCallback) {
    const debugTile = document.createElement("div");
    const debugMsg = document.createElement("div");
    const imgTile = document.createElement("img");

    if (this.pouchDBOptions.debug) {
      debugMsg.classList.add("debug");
      debugMsg.style.outline = "1px solid green";
      debugMsg.style.fontWeight = "bold";
      debugMsg.style.fontSize = "12pt";
      debugMsg.innerHTML = [coords.z, coords.x, coords.y].join("/");

      debugTile.appendChild(imgTile);
      debugTile.appendChild(debugMsg);
      imgTile.style.position = "absolute";
      imgTile.style.top = "0px";
      imgTile.style.left = "0px";
      debugMsg.style.position = "absolute";
      debugMsg.style.top = "0px";
      debugMsg.style.left = "0px";
      debugMsg.style.width = "100%";
      debugMsg.style.height = "100%";
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
      this._db
        .get(
          tileUrl,
          // eslint-disable-next-line @typescript-eslint/camelcase
          { revs_info: true }
        )
        .then(this._onCacheLookup(imgTile, debugMsg, tileUrl, done))
        .catch((reason) => {
          if (reason && reason.status === 404) {
            this._onCacheMiss(imgTile, debugMsg, tileUrl, done);
          } else {
            console.log("Cannot get from PouchDB");
            console.error(reason);
            throw reason;
          }
        });
    } else {
      // Fall back to standard behaviour
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
              const j = JSON.stringify(coords);
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
    tile: HTMLImageElement,
    debugMsg: HTMLDivElement,
    tileUrl: string,
    done: DoneCallback
  ) {
    return (
      data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta
    ) => {
      if (data) {
        return this._onCacheHit(tile, debugMsg, tileUrl, data, done);
      } else {
        return this._onCacheMiss(tile, debugMsg, tileUrl, done);
      }
    };
  }

  _onCacheHit(
    tile: HTMLImageElement,
    debugMsg: HTMLDivElement,
    tileUrl: string,
    data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta,
    done?: DoneCallback
  ) {
    this.fire("tilecachehit", {
      tile: tile,
      url: tileUrl,
    });
    if (this.pouchDBOptions.debug) {
      debugMsg.innerHTML += ", _onCacheHit";
    }

    try {
      if (
        Date.now() > data.timestamp + this.pouchDBOptions.cacheMaxAge &&
        !this.pouchDBOptions.useOnlyCache
      ) {
        // Tile is too old, try to refresh it
        console.debug(
          `Tile is too old: ${tileUrl}, ${Date.now()} > ${data.timestamp}`
        );

        if (this.pouchDBOptions.debug) {
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
        tile.crossOrigin = "Anonymous";
        tile.src = tileUrl;
      } else {
        if (this.pouchDBOptions.debug) {
          debugMsg.style.color = "green";
          debugMsg.innerHTML += ", loadFromCache";
        }
        this._db.getAttachment(tileUrl, "tile").then((blob) => {
          const url = URL.createObjectURL(blob);
          tile.src = url;
        });
      }
      return;
    } catch (reason) {
      if (reason && reason.status === 404) {
        this._onCacheMiss(tile, debugMsg, tileUrl, done);
      } else {
        throw reason;
      }
    }
  }

  _onCacheMiss(
    tile: HTMLImageElement,
    debugMsg: HTMLDivElement,
    tileUrl: string,
    done?: DoneCallback
  ) {
    this.fire("tilecachemiss", {
      tile: tile,
      url: tileUrl,
    });

    if (this.pouchDBOptions.debug) {
      debugMsg.style.color = "white";
      debugMsg.innerHTML += ", _onCacheMiss";
    }

    if (this.pouchDBOptions.useOnlyCache) {
      // Offline, not cached
      // 	console.log('Tile not in cache', tileUrl);
      // tile.onload = Util.falseFn;
      tile.src = Util.emptyImageUrl;
    } else {
      // Online, not cached, request the tile normally
      // console.log('Requesting tile normally', tileUrl);
      if (this.pouchDBOptions.saveToCache) {
        this.saveTile(this.pouchDBOptions.cacheFormat, true, tileUrl);
      }
      tile.crossOrigin = "Anonymous";
      tile.src = tileUrl;
    }
    return;
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
    if (this.worker) {
      this.worker.saveTile(format, override, tileUrl, existingRevision);
      return;
    } else {
      (async () => {
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
                // eslint-disable-next-line @typescript-eslint/camelcase
                content_type: format,
                data: blob,
              },
            },
          });
          this.pouchDBOptions.debug && console.debug(`${tileUrl}: Done`);
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
}

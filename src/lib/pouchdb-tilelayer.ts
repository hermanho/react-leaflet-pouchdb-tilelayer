import PouchDB from 'pouchdb-browser';
import * as Comlink from 'comlink';
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
} from 'leaflet';
import escapeHtml from 'escape-html';
import { PouchDBTileLayerOptions, OfflineTile } from './type';
import { WorkerType } from './worker/worker';
import Worker from './worker/worker?worker&inline';
import retryUntilWritten from './retry';

const workerSupport = typeof Worker !== 'undefined';

const defaultOption: PouchDBTileLayerOptions = {
  useCache: true,
  saveToCache: true,
  useOnlyCache: false,
  cacheFormat: 'image/png',
  cacheMaxAge: 1 * 3600 * 1000,
  cacheNextZoomLevel: true,
  useWorker: true,
};

export class LeafletPouchDBTileLayer extends LeafletTileLayer {
  _db?: PouchDB.Database<OfflineTile>;
  pouchDBOptions: Required<PouchDBTileLayerOptions>;
  _worker?: Worker;
  workerRemote?: Comlink.Remote<WorkerType>;
  debug: Console['debug'];

  constructor(urlTemplate: string, options?: PouchDBTileLayerOptions) {
    super(urlTemplate, Object.assign({}, defaultOption, options));
    this.pouchDBOptions = Object.assign(
      {},
      defaultOption,
      options,
    ) as Required<PouchDBTileLayerOptions>;

    this.on('tileunload', this.onTileUnload);

    this.debug = function () {};
    if (this.pouchDBOptions.debugOnUI) {
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
      this.debug = console.debug.bind(window.console);
    }
  }

  // Overwrites L.TileLayer.prototype.createTile
  createTile(coords: Coords, done?: DoneCallback) {
    const debugTile = document.createElement('div');
    const debugMsgContainer = document.createElement('div');
    const debugMsg = document.createElement('div');
    const imgTile = document.createElement('img');

    if (this.pouchDBOptions.debugOnUI) {
      debugMsgContainer.classList.add('debug');
      debugMsgContainer.classList.add('debugContainerCSS');
      debugMsg.classList.add('debug');
      debugMsg.classList.add('debugMsgCSS');
      debugMsg.innerHTML = [coords.z, coords.x, coords.y].join('/');

      debugMsgContainer.appendChild(debugMsg);
      debugTile.appendChild(imgTile);
      debugTile.appendChild(debugMsgContainer);
      imgTile.style.position = 'absolute';
      imgTile.style.top = '0px';
      imgTile.style.left = '0px';
    }

    DomEvent.on(
      imgTile,
      'load',
      Util.bind(this._tileOnLoad, this, done, imgTile),
    );
    DomEvent.on(
      imgTile,
      'error',
      Util.bind(this._tileOnError, this, done, imgTile),
    );

    if (this.options.crossOrigin) {
      imgTile.crossOrigin = '';
    }

    /*
         Alt tag is *set to empty string to keep screen readers from reading URL and for compliance reasons
         http://www.w3.org/TR/WCAG20-TECHS/H67
         */
    imgTile.alt = '';

    const tileUrl = this.getTileUrl(coords);

    if (this.pouchDBOptions.useCache) {
      (async () => {
        let cacheDone = false;
        setTimeout(() => {
          if (!cacheDone && imgTile.src !== tileUrl) {
            imgTile.src = tileUrl;
          }
        }, 500);
        try {
          await this._onCacheLookup(imgTile, debugMsg, coords);
          cacheDone = true;
        } catch (reason) {
          if (imgTile.src !== tileUrl) {
            imgTile.src = tileUrl;
          }
          if (reason && (reason as any).status === 404) {
            this._onCacheMiss(imgTile, debugMsg, coords);
          } else {
            console.log('Cannot get from PouchDB');
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
            if (this.pouchDBOptions.debugOnUI) {
              debugMsg.innerHTML += escapeHtml(
                `, cacheNextZoomLevel (${zoom})`,
              );
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
    if (this.pouchDBOptions.debugOnUI) {
      return debugTile;
    } else {
      return imgTile;
    }
  }

  // Returns a callback (closure over tile/key/originalSrc) to be run when the DB
  //   backend is finished with a fetch operation.
  async _onCacheLookup(
    tile: HTMLImageElement,
    debugMsg: HTMLDivElement,
    coords: Coords,
  ) {
    const tileDbKeyId = this._getTileDBKey(coords);
    const data = await this._db?.get(tileDbKeyId);
    if (data) {
      return this._onCacheHit(tile, debugMsg, coords, data);
    } else {
      return this._onCacheMiss(tile, debugMsg, coords);
    }
  }

  async _onCacheHit(
    tile: HTMLImageElement,
    debugMsg: HTMLDivElement,
    coords: Coords,
    data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta,
  ) {
    const tileUrl = this._getTileUrl(coords);
    const tileDbKeyId = this._getTileDBKey(coords);
    this.fire('tilecachehit', {
      tile,
      coords,
      tileDbKeyId,
    });
    if (this.pouchDBOptions.debugOnUI) {
      debugMsg.innerHTML += ', _onCacheHit';
    }
    this.debug('_onCacheHit', {
      tileUrl,
      tileDbKeyId,
      coords,
    });

    const t0 = performance.now();

    try {
      if (
        Date.now() > data.timestamp + this.pouchDBOptions.cacheMaxAge &&
        !this.pouchDBOptions.useOnlyCache
      ) {
        // Tile is too old, try to refresh it
        if (this.pouchDBOptions.debug) {
          this.debug(
            `Tile is too old: ${tileUrl}, ${Date.now()} > ${data.timestamp}`,
            {
              tileUrl,
              tileDbKeyId,
              coords,
            },
          );
          if (this.pouchDBOptions.debugOnUI) {
            debugMsg.style.color = 'orange';
            debugMsg.innerHTML += escapeHtml(
              `, too old(${new Date(data.timestamp)})`,
            );
          }
        }

        if (this.pouchDBOptions.saveToCache) {
          this.saveTile(this.pouchDBOptions.cacheFormat, true, coords);
        }
        const t1 = performance.now();
        if (this.pouchDBOptions.debugOnUI) {
          debugMsg.innerHTML += escapeHtml(
            `, ${tileUrl} took ${t1 - t0} milliseconds.`,
          );
        }
        tile.crossOrigin = 'Anonymous';
        if (tile.src !== tileUrl) {
          tile.src = tileUrl;
        }
      } else {
        if (this.pouchDBOptions.debugOnUI) {
          debugMsg.style.color = 'green';
          debugMsg.innerHTML += ', loadFromCache';
        }
        if (this._db) {
          const blob = await this._db.getAttachment(tileDbKeyId, 'tile');
          const newSrc = URL.createObjectURL(blob as Blob);
          if (tile.src !== newSrc) {
            tile.src = newSrc;
          }
          const t1 = performance.now();
          if (this.pouchDBOptions.debugOnUI) {
            debugMsg.innerHTML += escapeHtml(
              `,getAttachment ${tileUrl} took ${Math.ceil(
                t1 - t0,
              )} milliseconds.`,
            );
          }
        }
      }
    } catch (reason) {
      if (reason && (reason as any).status === 404) {
        return this._onCacheMiss(tile, debugMsg, coords);
      } else {
        throw reason;
      }
    }
  }

  _onCacheMiss(
    tile: HTMLImageElement,
    debugMsg: HTMLDivElement,
    coords: Coords,
  ) {
    const tileUrl = this._getTileUrl(coords);
    const tileDbKeyId = this._getTileDBKey(coords);
    this.fire('tilecachemiss', {
      tile,
      coords,
      tileDbKeyId,
    });
    if (this.pouchDBOptions.debugOnUI) {
      debugMsg.style.color = 'white';
      debugMsg.innerHTML += ', _onCacheMiss';
    }
    this.debug('_onCacheMiss', {
      tileUrl,
      tileDbKeyId,
      coords,
      src: tile.src,
    });

    if (this.pouchDBOptions.useOnlyCache) {
      // Offline, not cached
      // 	console.log('Tile not in cache', tileUrl);
      // tile.onload = Util.falseFn;
      tile.src = Util.emptyImageUrl;
    } else {
      // Online, not cached, request the tile normally
      // console.log('Requesting tile normally', tileUrl);
      if (this.pouchDBOptions.saveToCache) {
        this.saveTile(this.pouchDBOptions.cacheFormat, true, coords);
      }
      tile.crossOrigin = 'Anonymous';
      if (tile.src !== tileUrl && !tile.src.startsWith('blob:')) {
        tile.src = tileUrl;
      }
    }
  }

  // Modified L.TileLayer.getTileUrl, this will use the zoom given by the parameter coords
  //  instead of the maps current zoomlevel.
  // https://github.com/Leaflet/Leaflet/blob/1d09819922f592cd0fcdf37eb1fc263544a8bab6/src/layer/tile/TileLayer.js#L169
  _getTileUrl(coords: Coords) {
    let zoom = coords.z;
    if (this.options.zoomReverse && this.options.maxZoom) {
      zoom = this.options.maxZoom - zoom;
    }
    if (this.options.zoomOffset) {
      zoom += this.options.zoomOffset;
    }
    const data = {
      r: Browser.retina ? '@2x' : '',
      s: this._getSubdomain(coords),
      x: coords.x,
      y: coords.y,
      z: zoom,
      '-y': 0,
    };
    if (
      this._map &&
      !this._map.options.crs?.infinite &&
      this._globalTileRange.max?.y
    ) {
      const invertedY = this._globalTileRange.max.y - coords.y;
      if (this.options.tms) {
        data['y'] = invertedY;
      }
      data['-y'] = invertedY;
    }

    return Util.template(this._url, Util.extend(data, this.options));
  }

  _getTileDBKey(coords: Coords) {
    let zoom = coords.z;
    if (this.options.zoomReverse && this.options.maxZoom) {
      zoom = this.options.maxZoom - zoom;
    }
    if (this.options.zoomOffset) {
      zoom += this.options.zoomOffset;
    }
    const data = {
      r: Browser.retina ? '@2x' : '',
      s: '***',
      x: coords.x,
      y: coords.y,
      z: zoom,
      '-y': 0,
    };
    if (
      this._map &&
      !this._map.options.crs?.infinite &&
      this._globalTileRange.max?.y
    ) {
      const invertedY = this._globalTileRange.max.y - coords.y;
      if (this.options.tms) {
        data['y'] = invertedY;
      }
      data['-y'] = invertedY;
    }

    return Util.template(this._url, Util.extend(data, this.options));
  }

  saveTile(format: string, override: boolean, coords: Coords) {
    requestAnimationFrame(() => {
      (async () => {
        const tileUrl = this._getTileUrl(coords);
        const tileDbKeyId = this._getTileDBKey(coords);
        this.debug(`saveTile coords: `, { tileDbKeyId, coords });
        if (this.workerRemote) {
          this.workerRemote.saveTile(format, override, tileDbKeyId, tileUrl);
          return;
        } else {
          if (this._db) {
            let data:
              | (PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta)
              | null = null;
            const t0 = performance.now();
            try {
              try {
                data = await this._db.get(tileDbKeyId, { revs_info: true });
                if (!override && data) {
                  return;
                }
              } catch {
                //
              }
              this.debug(`No data found in _seedOneTile`, {
                tileDbKeyId,
                coords,
              });
              const response = await fetch(tileUrl);
              const blob = await response.blob();
              this.debug(`saveTileBlobThread: Saving`, {
                tileUrl,
                tileDbKeyId,
                coords,
              });

              await retryUntilWritten(this._db, {
                _id: tileDbKeyId,
                _rev: data?._rev,
                timestamp: Date.now(),
                _attachments: {
                  tile: {
                    content_type: format,
                    data: blob,
                  },
                },
              });
              const t1 = performance.now();
              this.debug(`Done`, {
                tileUrl,
                tileDbKeyId,
                coords,
              });
              if (this.pouchDBOptions.profiling) {
                console.log(
                  `inline saveTile ${tileUrl} took ${t1 - t0} milliseconds.`,
                );
              }
            } catch (err) {
              console.error(err);
            }
          }
        }
      })();
    });
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
        new Bounds([northEastPoint, southWestPoint]),
      );

      if (tileRange.min && tileRange.max) {
        for (let j = tileRange.min.y; j <= tileRange.max.y; j++) {
          for (let i = tileRange.min.x; i <= tileRange.max.x; i++) {
            const coords = new Point(i, j) as Coords;
            coords.z = z;
            this.saveTile(this.pouchDBOptions.cacheFormat, false, coords);
            count++;
          }
        }
      }
    }
    this.debug(`seed loaded ${count}`);
  }

  seedBounds(tileRange: Bounds, z: number) {
    if (!this.pouchDBOptions.useCache) return;
    if (!this._map) return;

    let count = 0;

    if (tileRange.min && tileRange.max) {
      for (let j = tileRange.min.y; j <= tileRange.max.y; j++) {
        for (let i = tileRange.min.x; i <= tileRange.max.x; i++) {
          const coords = new Point(i, j) as Coords;
          coords.z = z;
          this.saveTile(this.pouchDBOptions.cacheFormat, false, coords);
          count++;
        }
      }
    }

    this.debug(`seedBounds loaded ${count}`);
  }

  onTileUnload(e: TileEvent) {
    let imgSrc: string | undefined = (e.tile as HTMLImageElement).src;
    if (this.pouchDBOptions.debugOnUI) {
      imgSrc = e.tile.querySelector('img')?.src;
    }
    if (imgSrc && imgSrc.startsWith('blob:')) {
      URL.revokeObjectURL(imgSrc);
    }
  }

  onAdd(map: Map): this {
    if (this.pouchDBOptions.useCache) {
      this._db = new PouchDB('offline-tiles');
      // this._worker = workerSupport ? new Worker(workerBlobURI) : undefined;
      // const workerUrl = new URL('./worker/worker.ts', import.meta.url);
      // this._worker = workerSupport
      // ? new Worker(workerUrl, {
      //     type: 'module',
      //   })
      // : undefined;
      this._worker = workerSupport ? new Worker() : undefined;
      this.workerRemote =
        this._worker && this.pouchDBOptions.useWorker && this._worker
          ? Comlink.wrap(this._worker)
          : undefined;
      if (this.workerRemote) {
        this.workerRemote.setDebug(this.pouchDBOptions.debug);
        this.workerRemote.setProfiling(this.pouchDBOptions.profiling);
      }
      if (workerSupport && !this._worker && this.pouchDBOptions.useWorker) {
        console.warn('something wrong that cannot create worker 😣');
      }
    } else {
      this._db = undefined;
    }
    super.onAdd(map);
    return this;
  }

  onRemove(map: Map) {
    super.onRemove(map);
    this._worker?.terminate();
    this._worker = undefined;
    this.workerRemote = undefined;
    this._db?.close();
    this._db = undefined;
    return this;
  }
}

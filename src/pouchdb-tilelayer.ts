import PouchDB from "pouchdb";
import {
  Bounds,
  Coords,
  DomEvent,
  DoneCallback,
  Point,
  Browser,
  LatLngBounds,
  LatLngExpression,
  TileLayer as LeafletTileLayer,
  Util,
} from "leaflet";
import { MergedPouchDBTileLayerOptions, OfflineTile, SeedData } from "../type";

// const worker = Worker && new Worker("worker.js");

export class LeafletPouchDBTileLayer extends LeafletTileLayer {
  _db?: PouchDB.Database<OfflineTile>;
  options: MergedPouchDBTileLayerOptions;

  constructor(urlTemplate: string, options?: MergedPouchDBTileLayerOptions) {
    super(urlTemplate, options);
    if (options.useCache) {
      this._db = new PouchDB("offline-tiles");
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
      DomEvent.on(tile, "load", Util.bind(this._tileOnLoad, this, done, tile));
      // Fall back to standard behaviour
      tile.src = tileUrl;
    }

    if (this.options.cacheNextZoomLevel) {
      const _self = this;
      setTimeout(() => {
        if (_self._map) {
          const zoom = _self._clampZoom(coords.z + 1);
          if (
            !(
              (_self.options.maxZoom !== undefined &&
                zoom > _self.options.maxZoom) ||
              (_self.options.minZoom !== undefined &&
                zoom < _self.options.minZoom)
            )
          ) {
            console.debug(`cacheNextZoomLevel => ${JSON.stringify(coords)}`);
            const tileBounds = _self._tileCoordsToBounds(coords);
            _self.seed(tileBounds, zoom, zoom);
          }
        }
      }, 1000);
    }

    // //cache 9 grid related from center
    // for (let x = coords.x - 1; x <= coords.x + 1; x++) {
    //   for (let y = coords.y - 1; y <= coords.y + 1; y++) {
    //     const c = new Point(x, y) as Coords;
    //     c.z = coords.z;
    //     const tileBounds = this._tileCoordsToBounds(c);
    //     this.seed(tileBounds, c.z, c.z);
    //   }
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
      DomEvent.off(tile, "error", Util.bind(loadFromCache, this));
    };

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
          // if (Worker) {
          //   worker.postMessage({
          //     topic: "saveTile",
          //     data: {
          //       cacheFormat: this.options.cacheFormat,
          //       tileUrl,
          //       existingRevision: data._revs_info[0].rev,
          //     },
          //   });
          // } else {
          // DomEvent.on(
          //   tile,
          //   "load",
          //   Util.bind(
          //     this._saveTile,
          //     this,
          //     tile,
          //     tileUrl,
          //     data._revs_info[0].rev,
          //     done
          //   )
          // );
          this._saveTileBlob(tileUrl, data._revs_info[0].rev);
          // }
        }
        tile.crossOrigin = "Anonymous";
        tile.src = tileUrl;

        DomEvent.on(tile, "error", Util.bind(loadFromCache, this));
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
        // DomEvent.on(
        //   tile,
        //   "load",
        //   Util.bind(this._saveTile, this, tile, tileUrl, undefined, done)
        // );
        this._saveTileBlob(tileUrl);
      }
      tile.crossOrigin = "Anonymous";
      tile.src = tileUrl;
    }
    return;
  }

  // Async'ly saves the tile as a PouchDB attachment
  // Will run the done() callback (if any) when finished.
  _saveTile(
    tile: HTMLImageElement,
    tileUrl: string,
    existingRevision?: PouchDB.Core.RevisionId,
    done?: DoneCallback
  ) {
    if (!this.options.saveToCache) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = tile.naturalWidth || tile.width;
    canvas.height = tile.naturalHeight || tile.height;

    const context = canvas.getContext("2d");
    context.drawImage(tile, 0, 0);

    const format = this.options.cacheFormat;

    const _self = this;
    canvas.toBlob(async function (blob) {
      try {
        const status = await _self._db.put({
          _id: tileUrl,
          _rev: existingRevision,
          timestamp: Date.now(),
        });
        // const resp = await _self._db.putAttachment(
        await _self._db.putAttachment(
          tileUrl,
          "tile",
          status.rev,
          blob,
          format
        );
        // if (resp && done) {
        //   return done(null, tile);
        // }
      } catch (reason) {
        // Saving the tile to the cache might have failed,
        // but the tile itself has been loaded.
        if (done) {
          if (reason instanceof Error) {
            return done(reason, tile);
          }
          // return done(null, tile);
        }
      }
    }, format);
  }

  async _saveTileBlob(
    tileUrl: string,
    existingRevision?: PouchDB.Core.RevisionId
  ) {
    if (!this.options.saveToCache) {
      return;
    }
    const response = await fetch(tileUrl);
    const blob = await response.blob();

    const format = this.options.cacheFormat;
    try {
      const status = await this._db.put({
        _id: tileUrl,
        _rev: existingRevision,
        timestamp: Date.now(),
      });
      // const resp = await _self._db.putAttachment(
      await this._db.putAttachment(tileUrl, "tile", status.rev, blob, format);
    } catch (err) {
      if ((err as PouchDB.Core.Error).status === 409) {
        const status = await this._db.remove({
          _id: tileUrl,
          _rev: existingRevision,
        });
        await this._db.putAttachment(tileUrl, "tile", status.rev, blob, format);
      }
    }
    // if (resp && done) {
    //   return done(null, tile);
    // }
  }

  // 'react-leaflet/TileLayer'
  _createTile() {
    return document.createElement("img");
  }

  // Modified L.TileLayer.getTileUrl, this will use the zoom given by the parameter coords
  //  instead of the maps current zoomlevel.
  _getTileUrl(coords: Coords) {
    let zoom = coords.z;
    if (this.options.zoomReverse) {
      zoom = this.options.maxZoom - zoom;
    }
    zoom += this.options.zoomOffset;
    return Util.template(
      this._url,
      Util.extend(
        {
          r:
            this.options.detectRetina &&
            Browser.retina &&
            this.options.maxZoom > 0
              ? "@2x"
              : "",
          s: this._getSubdomain(coords),
          x: coords.x,
          y: this.options.tms
            ? this._globalTileRange.max.y - coords.y
            : coords.y,
          z: this.options.maxNativeZoom
            ? Math.min(zoom, this.options.maxNativeZoom)
            : zoom,
        },
        this.options
      )
    );
  }

  // from _getTiledPixelBounds
  getTiledPixelBoundsByZoom(center: LatLngExpression, zoom: number) {
    const map = this._map,
      scale = map.getZoomScale(zoom, zoom),
      pixelCenter = map.project(center, zoom).floor(),
      halfSize = map.getSize().divideBy(scale * 2);
    return new Bounds(
      pixelCenter.subtract(halfSize),
      pixelCenter.add(halfSize)
    );
  }

  // 🍂section PouchDB tile caching methods
  // 🍂method seed(bbox: LatLngBounds, minZoom: Number, maxZoom: Number): this
  // Starts seeding the cache given a bounding box and the minimum/maximum zoom levels
  // Use with care! This can spawn thousands of requests and flood tileservers!
  seed(bbox: LatLngBounds, minZoom: number, maxZoom: number) {
    if (!this.options.useCache) return;
    if (minZoom > maxZoom) return;
    if (!this._map) return;

    const queue: string[] = [];

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
          queue.push(this._getTileUrl(point));
        }
      }
    }

    const seedData: SeedData = {
      bbox: bbox,
      minZoom: minZoom,
      maxZoom: maxZoom,
      queueLength: queue.length,
    };
    this.fire("seedstart", seedData);

    for (let i = 0; i < queue.length; i++) {
      this.fire("seedprogress", {
        bbox: seedData.bbox,
        minZoom: seedData.minZoom,
        maxZoom: seedData.maxZoom,
        queueLength: seedData.queueLength,
        remainingLength: queue.length - i,
      });

      this._seedOneTile(queue[i]);
    }
    this.fire("seedend", seedData);
  }

  // Uses a defined tile to eat through one item in the queue and
  //   asynchronously recursively call itself when the tile has
  //   finished loading.
  _seedOneTile(url: string) {
    // const tile = this._createTile();

    (async () => {
      try {
        const data = await this._db.get(url);
        if (data) {
          return;
        }
        console.debug(`No data for ${url} in _seedOneTile`);
      } catch (err) {
        if (err && err.status === 404) {
          //
        } else {
          console.error(err);
        }
      }

      // if (Worker) {
      //   worker.postMessage({
      //     topic: "saveTile",
      //     data: {
      //       cacheFormat: this.options.cacheFormat,
      //       url,
      //     },
      //   });
      // } else {
      console.debug(`Load ${url} from network`);
      // DomEvent.on(tile, "load", Util.bind(this._saveTile, this, tile, url));
      // tile.crossOrigin = "Anonymous";
      // tile.src = url;
      await this._saveTileBlob(url);
      // }
    })();
  }
}

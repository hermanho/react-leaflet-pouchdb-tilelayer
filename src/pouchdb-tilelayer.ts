import PouchDB from "pouchdb";
import {
  Bounds,
  Coords,
  DoneCallback,
  Point,
  Browser,
  LatLngBounds,
  LatLngExpression,
  TileLayer as LeafletTileLayer,
  TileLayerOptions,
  Util,
} from "leaflet";

export interface PouchDBTileLayerOptions {
  useCache: boolean;
  saveToCache: boolean;
  useOnlyCache: boolean;
  cacheFormat: string;
  cacheMaxAge: number;
  cacheNextZoomLevel: boolean;
}

type MergedPouchDBTileLayerOptions = PouchDBTileLayerOptions & TileLayerOptions;

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

    tile.onerror = Util.bind(this._tileOnError, this, done, tile);

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
      tile.onload = Util.bind(this._tileOnLoad, this, done, tile);
      tile.src = tileUrl;
    }

    if (this.options.cacheNextZoomLevel) {
      const _self = this;
      setTimeout(() => {
        if (_self._map) {
          const zoom = _self._clampZoom(_self._map.getZoom() + 1);
          if (
            !(
              (_self.options.maxZoom !== undefined &&
                zoom > _self.options.maxZoom) ||
              (_self.options.minZoom !== undefined &&
                zoom < _self.options.minZoom)
            )
          ) {
            const tileBounds = _self._tileCoordsToBounds(coords);
            _self.seed(tileBounds, zoom, zoom);
          }
        }
      }, 1000);
    }

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

  async _onCacheHit(
    tile: HTMLImageElement,
    tileUrl: string,
    data: PouchDB.Core.Document<OfflineTile> & PouchDB.Core.GetMeta,
    done?: DoneCallback
  ) {
    this.fire("tilecachehit", {
      tile: tile,
      url: tileUrl,
    });

    const _self = this;
    try {
      // Read the attachment as blob
      const blob = await this._db.getAttachment(tileUrl, "tile");

      const url = URL.createObjectURL(blob);

      if (
        Date.now() > data.timestamp + _self.options.cacheMaxAge &&
        !_self.options.useOnlyCache
      ) {
        // Tile is too old, try to refresh it
        console.log("Tile is too old: ", tileUrl);

        if (_self.options.saveToCache) {
          tile.onload = Util.bind(
            _self._saveTile,
            _self,
            tile,
            tileUrl,
            data._revs_info[0].rev,
            done
          );
        }
        tile.crossOrigin = "Anonymous";
        tile.src = tileUrl;
        tile.onerror = function (ev) {
          // If the tile is too old but couldn't be fetched from the network,
          //   serve the one still in cache.
          _self.src = url;
        };
      } else {
        // Serve tile from cached data
        //console.log('Tile is cached: ', tileUrl);
        tile.onload = Util.bind(_self._tileOnLoad, _self, done, tile);
        tile.src = url;
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
      tile.onload = Util.falseFn;
      tile.src = Util.emptyImageUrl;
    } else {
      // Online, not cached, request the tile normally
      // console.log('Requesting tile normally', tileUrl);
      if (this.options.saveToCache) {
        tile.onload = Util.bind(
          this._saveTile,
          this,
          tile,
          tileUrl,
          undefined,
          done
        );
      } else {
        tile.onload = Util.bind(this._tileOnLoad, this, done, tile);
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
        const resp = await _self._db.putAttachment(
          tileUrl,
          "tile",
          status.rev,
          blob,
          format
        );
        if (resp && done) {
          return done(null, tile);
        }
      } catch (reason) {
        // Saving the tile to the cache might have failed,
        // but the tile itself has been loaded.
        if (done) {
          if (reason instanceof Error) {
            return done(reason, tile);
          }
          return done(null, tile);
        }
      }
    }, format);
  }

  // 'react-leaflet/TileLayer'
  _createTile() {
    return document.createElement("img");
  }

  // Modified L.TileLayer.getTileUrl, this will use the zoom given by the parameter coords
  //  instead of the maps current zoomlevel.
  _getTileUrl(coords: PointZ) {
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
          const point = new Point(i, j) as PointZ;
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
    const tile = this._createTile();
    return this._seedOneTile(tile, queue, seedData);
  }

  // Uses a defined tile to eat through one item in the queue and
  //   asynchronously recursively call itself when the tile has
  //   finished loading.
  async _seedOneTile(
    tile: HTMLImageElement,
    remaining: string[],
    seedData: SeedData
  ) {
    if (!remaining.length) {
      this.fire("seedend", seedData);
      return;
    }
    this.fire("seedprogress", {
      bbox: seedData.bbox,
      minZoom: seedData.minZoom,
      maxZoom: seedData.maxZoom,
      queueLength: seedData.queueLength,
      remainingLength: remaining.length,
    });

    const url = remaining.shift();

    const _self = this;
    let data: OfflineTile = null;
    try {
      data = await this._db.get(url);
      if (data) {
        await _self._seedOneTile(tile, remaining, seedData);
      }
    } catch {
      //
    }
    if (!data) {
      tile.onload = function (ev) {
        _self._saveTile(tile, url); //(ev)
        _self._seedOneTile(tile, remaining, seedData);
      };
      tile.crossOrigin = "Anonymous";
      tile.src = url;
    }
  }
}

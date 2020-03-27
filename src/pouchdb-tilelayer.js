import React, { useEffect, useState, useReducer } from "react";
import PropTypes from "prop-types";
import PouchDB from "pouchdb";
import {
  TileLayer as LeafletTileLayer,
  Util,
  Bounds,
  Point,
  Browser
} from "leaflet";
import { GridLayer, withLeaflet } from "react-leaflet";

const LeafletPouchDBTileLayer = LeafletTileLayer.extend({
  initialize: function(url, options) {
    const init = LeafletTileLayer.prototype.initialize.call(this, url, options);
    if (this.options.useCache) {
      this._db = new PouchDB("offline-tiles");
    } else {
      this._db = null;
    }
    return init;
  },
  // Overwrites L.TileLayer.prototype.createTile
  createTile: function(coords, done) {
    var tile = document.createElement("img");

    tile.onerror = Util.bind(this._tileOnError, this, done, tile);

    if (this.options.crossOrigin) {
      tile.crossOrigin = "";
    }

    /*
         Alt tag is *set to empty string to keep screen readers from reading URL and for compliance reasons
         http://www.w3.org/TR/WCAG20-TECHS/H67
         */
    tile.alt = "";

    var tileUrl = this.getTileUrl(coords);

    if (this.options.useCache) {
      this._db.get(
        tileUrl,
        { revs_info: true },
        this._onCacheLookup(tile, tileUrl, done)
      );
    } else {
      // Fall back to standard behaviour
      tile.onload = Util.bind(this._tileOnLoad, this, done, tile);
      tile.src = tileUrl;
    }

    if (this.options.cacheNextZoomLevel) {
      const _this = this;
      setTimeout(() => {
        if (_this._map) {
          const zoom = _this._clampZoom(_this._map.getZoom() + 1);
          if (
            !(
              (_this.options.maxZoom !== undefined &&
                zoom > _this.options.maxZoom) ||
              (_this.options.minZoom !== undefined &&
                zoom < _this.options.minZoom)
            )
          ) {
            const tileBounds = _this._tileCoordsToBounds(coords);
            _this.seed(tileBounds, zoom, zoom);
          }
        }
      }, 1000);
    }

    return tile;
  },

  // Returns a callback (closure over tile/key/originalSrc) to be run when the DB
  //   backend is finished with a fetch operation.
  _onCacheLookup: function(tile, tileUrl, done) {
    const _self = this;
    return function(err, data) {
      if (data) {
        return _self._onCacheHit(tile, tileUrl, data, done);
      } else {
        return _self._onCacheMiss(tile, tileUrl, done);
      }
    };
  },

  _onCacheHit: function(tile, tileUrl, data, done) {
    this.fire("tilecachehit", {
      tile: tile,
      url: tileUrl
    });

    const _self = this;
    // Read the attachment as blob
    this._db
      .getAttachment(tileUrl, "tile")
      .then(function(blob) {
        var url = URL.createObjectURL(blob);

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
          tile.onerror = function(ev) {
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
      })
      .catch(reason => {
        if (reason && reason.status === 404) {
          return _self._onCacheMiss(tile, tileUrl, done);
        } else {
          return reason;
        }
      });
  },

  _onCacheMiss: function(tile, tileUrl, done) {
    this.fire("tilecachemiss", {
      tile: tile,
      url: tileUrl
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
  },

  // Async'ly saves the tile as a PouchDB attachment
  // Will run the done() callback (if any) when finished.
  _saveTile: function(tile, tileUrl, existingRevision, done) {
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
    canvas.toBlob(function(blob) {
      _self._db
        .put({
          _id: tileUrl,
          _rev: existingRevision,
          timestamp: Date.now()
        })
        .then(function(status) {
          return _self._db.putAttachment(
            tileUrl,
            "tile",
            status.rev,
            blob,
            format
          );
        })
        .then(function(resp) {
          if (done) {
            done();
          }
        })
        .catch(function() {
          // Saving the tile to the cache might have failed,
          // but the tile itself has been loaded.
          if (done) {
            done();
          }
        });
    }, format);
  },

  // 'react-leaflet/TileLayer'
  _createTile: function() {
    return document.createElement("img");
  },

  // Modified L.TileLayer.getTileUrl, this will use the zoom given by the parameter coords
  //  instead of the maps current zoomlevel.
  _getTileUrl: function(coords) {
    var zoom = coords.z;
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
            : zoom
        },
        this.options
      )
    );
  },

  // from _getTiledPixelBounds
  getTiledPixelBoundsByZoom: function(center, zoom) {
    const map = this._map,
      scale = map.getZoomScale(zoom, zoom),
      pixelCenter = map.project(center, zoom).floor(),
      halfSize = map.getSize().divideBy(scale * 2);
    return new Bounds(
      pixelCenter.subtract(halfSize),
      pixelCenter.add(halfSize)
    );
  },

  // 🍂section PouchDB tile caching methods
  // 🍂method seed(bbox: LatLngBounds, minZoom: Number, maxZoom: Number): this
  // Starts seeding the cache given a bounding box and the minimum/maximum zoom levels
  // Use with care! This can spawn thousands of requests and flood tileservers!
  seed: function(bbox, minZoom, maxZoom) {
    if (!this.options.useCache) return;
    if (minZoom > maxZoom) return;
    if (!this._map) return;

    const queue = [];

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
          const point = new Point(i, j);
          point.z = z;
          queue.push(this._getTileUrl(point));
        }
      }
    }

    const seedData = {
      bbox: bbox,
      minZoom: minZoom,
      maxZoom: maxZoom,
      queueLength: queue.length
    };
    this.fire("seedstart", seedData);
    const tile = this._createTile();
    tile._layer = this;
    this._seedOneTile(tile, queue, seedData);
    return this;
  },

  // Uses a defined tile to eat through one item in the queue and
  //   asynchronously recursively call itself when the tile has
  //   finished loading.
  _seedOneTile: function(tile, remaining, seedData) {
    if (!remaining.length) {
      this.fire("seedend", seedData);
      return;
    }
    this.fire("seedprogress", {
      bbox: seedData.bbox,
      minZoom: seedData.minZoom,
      maxZoom: seedData.maxZoom,
      queueLength: seedData.queueLength,
      remainingLength: remaining.length
    });

    const url = remaining.shift();

    const _self = this;
    this._db.get(url, function(err, data) {
      if (!data) {
        /// FIXME: Do something on tile error!!
        tile.onload = function(ev) {
          _self._saveTile(tile, url, null); //(ev)
          _self._seedOneTile(tile, remaining, seedData);
        };
        tile.crossOrigin = "Anonymous";
        tile.src = url;
      } else {
        _self._seedOneTile(tile, remaining, seedData);
      }
    });
  }
});

class PouchDBTileLayer extends GridLayer {
  createLeafletElement(props) {
    return new LeafletPouchDBTileLayer(props.url, this.getOptions(props));
  }

  updateLeafletElement(fromProps, toProps) {
    super.updateLeafletElement(fromProps, toProps);
    if (toProps.url !== fromProps.url) {
      this.leafletElement.setUrl(toProps.url);
    }
  }
}

PouchDBTileLayer.propTypes = {
  useCache: PropTypes.bool,
  saveToCache: PropTypes.bool,
  useOnlyCache: PropTypes.bool,
  cacheFormat: PropTypes.string,
  cacheMaxAge: PropTypes.number,
  cacheNextZoomLevel: PropTypes.bool
};

PouchDBTileLayer.defaultProps = {
  useCache: true,
  saveToCache: true,
  useOnlyCache: false,
  cacheFormat: "image/png",
  cacheMaxAge: 1 * 3600 * 1000,
  cacheNextZoomLevel: true
};

export default withLeaflet(PouchDBTileLayer);

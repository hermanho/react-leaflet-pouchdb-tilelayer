# react-leaflet-pouchdb-tilelayer

[![version](https://img.shields.io/npm/v/react-leaflet-pouchdb-tilelayer.svg?style=plastic)](http://npm.im/react-leaflet-pouchdb-tilelayer)
[![react-leaflet compatibility](https://img.shields.io/npm/dependency-version/react-leaflet-pouchdb-tilelayer/peer/react-leaflet.svg?style=plastic)](https://github.com/hermanho/react-leaflet-pouchdb-tilelayer)
[![Build Status](https://travis-ci.com/hermanho/react-leaflet-pouchdb-tilelayer.svg?branch=master)](https://travis-ci.com/hermanho/react-leaflet-pouchdb-tilelayer)
[![dependencies](https://img.shields.io/david/hermanho/react-leaflet-pouchdb-tilelayer.svg?style=plastic)](https://david-dm.org/hermanho/react-leaflet-pouchdb-tilelayer)
[![peer dependencies](https://img.shields.io/david/peer/hermanho/react-leaflet-pouchdb-tilelayer.svg?style=plastic)](https://david-dm.org/hermanho/react-leaflet-pouchdb-tilelayer?type=peer)

React version of [Leaflet.TileLayer.PouchDBCached](https://github.com/MazeMap/Leaflet.TileLayer.PouchDBCached)

## Installation

### Install via NPM

```bash
npm install react-leaflet-pouchdb-tilelayer --save
```

### Usage with React-Leaflet v2

This plugin is compatible with version 2 of React-Leaflet

```javascript
import { Map, TileLayer, LayersControl } from "react-leaflet";
import PouchDBTileLayer from "react-leaflet-pouchdb-tilelayer";

<Map center={[22.287, 114.1694]} zoom={15}>
  <LayersControl position="topleft">
    <LayersControl.BaseLayer checked name="PouchDBTileLayer">
      <PouchDBTileLayer
        useCache={true}
        crossOrigin={true}
        attribution='&copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    </LayersControl.BaseLayer>
    <LayersControl.BaseLayer name="TileLayer">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
      />
    </LayersControl.BaseLayer>
  </LayersControl>
</Map>;
```

## Control options

### position

`{ useCache: true }`

Enable the cache logic

### saveToCache

`{ saveToCache: true }`

Save the map tile to PouchDB

### useOnlyCache

`{ useOnlyCache: false }`

Load from PouchDB cache and do not download from web

### cacheFormat

`{ cacheFormat: 'image/png' }`

The mine type

### cacheMaxAge

`{ cacheMaxAge: 3600000 }`

cache age in millisecond unit

### cacheNextZoomLevel

`{ cacheNextZoomLevel: true }`

pre-load and cache the next level tile

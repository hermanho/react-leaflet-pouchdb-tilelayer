/// <reference types="react" />
import { TileLayerProps } from "react-leaflet";
import { PouchDBTileLayerOptions } from "./pouchdb-tilelayer";
export declare type PouchDBTileLayerProps = PouchDBTileLayerOptions & TileLayerProps;
declare const ReactPouchDBTileLayer: import("react").ComponentType<Pick<PouchDBTileLayerProps, "children" | "url" | "useCache" | "saveToCache" | "useOnlyCache" | "cacheFormat" | "cacheMaxAge" | "cacheNextZoomLevel" | "attribution" | "pane" | "tileSize" | "opacity" | "updateWhenIdle" | "updateWhenZooming" | "updateInterval" | "zIndex" | "bounds" | "minZoom" | "maxZoom" | "noWrap" | "className" | "keepBuffer" | "onloading" | "onload" | "ontileloadstart" | "ontileload" | "ontileunload" | "ontileerror" | "id" | "accessToken" | "maxNativeZoom" | "minNativeZoom" | "subdomains" | "errorTileUrl" | "zoomOffset" | "tms" | "zoomReverse" | "detectRetina" | "crossOrigin">>;
export default ReactPouchDBTileLayer;

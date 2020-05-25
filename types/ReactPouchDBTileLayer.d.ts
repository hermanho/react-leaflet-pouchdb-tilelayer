/// <reference types="react" />
import { TileLayerProps } from "react-leaflet";
import { PouchDBTileLayerOptions } from "../type";
export declare type PouchDBTileLayerProps = PouchDBTileLayerOptions & TileLayerProps;
declare const ReactPouchDBTileLayer: import("react").ComponentType<Pick<PouchDBTileLayerProps, "useCache" | "saveToCache" | "useOnlyCache" | "cacheFormat" | "cacheMaxAge" | "cacheNextZoomLevel" | "url" | "attribution" | "children" | "pane" | "tileSize" | "opacity" | "updateWhenIdle" | "updateWhenZooming" | "updateInterval" | "zIndex" | "bounds" | "minZoom" | "maxZoom" | "noWrap" | "className" | "keepBuffer" | "onloading" | "onload" | "ontileloadstart" | "ontileload" | "ontileunload" | "ontileerror" | "id" | "accessToken" | "maxNativeZoom" | "minNativeZoom" | "subdomains" | "errorTileUrl" | "zoomOffset" | "tms" | "zoomReverse" | "detectRetina" | "crossOrigin">>;
export default ReactPouchDBTileLayer;

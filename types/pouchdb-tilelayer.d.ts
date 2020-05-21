/// <reference types="react" />
import { TileLayerProps } from "react-leaflet";
export declare class PouchDBTileLayerOptions {
    useCache: boolean;
    saveToCache: boolean;
    useOnlyCache: boolean;
    cacheFormat: string;
    cacheMaxAge: number;
    cacheNextZoomLevel: boolean;
}
export interface PouchDBTileLayerProps extends PouchDBTileLayerOptions, TileLayerProps {
}
declare const ReactPouchDBTileLayer: import("react").ComponentType<Pick<PouchDBTileLayerProps, "children" | "url" | "useCache" | "saveToCache" | "useOnlyCache" | "cacheFormat" | "cacheMaxAge" | "cacheNextZoomLevel" | "attribution" | "pane" | "tileSize" | "opacity" | "updateWhenIdle" | "updateWhenZooming" | "updateInterval" | "zIndex" | "bounds" | "minZoom" | "maxZoom" | "noWrap" | "className" | "keepBuffer" | "onloading" | "onload" | "ontileloadstart" | "ontileload" | "ontileunload" | "ontileerror" | "id" | "accessToken" | "maxNativeZoom" | "minNativeZoom" | "subdomains" | "errorTileUrl" | "zoomOffset" | "tms" | "zoomReverse" | "detectRetina" | "crossOrigin">>;
export default ReactPouchDBTileLayer;

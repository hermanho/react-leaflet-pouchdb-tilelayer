/// <reference types="react" />
import { GridLayerProps } from "react-leaflet";
export declare class PouchDBTileLayerOptions {
    useCache: boolean;
    saveToCache: boolean;
    useOnlyCache: boolean;
    cacheFormat: string;
    cacheMaxAge: number;
    cacheNextZoomLevel: boolean;
}
export interface PouchDBTileLayerProps extends PouchDBTileLayerOptions, GridLayerProps {
}
declare const _default: import("react").ComponentType<Pick<PouchDBTileLayerProps, "children" | "useCache" | "saveToCache" | "useOnlyCache" | "cacheFormat" | "cacheMaxAge" | "cacheNextZoomLevel" | "attribution" | "pane" | "tileSize" | "opacity" | "updateWhenIdle" | "updateWhenZooming" | "updateInterval" | "zIndex" | "bounds" | "minZoom" | "maxZoom" | "noWrap" | "className" | "keepBuffer">>;
export default _default;

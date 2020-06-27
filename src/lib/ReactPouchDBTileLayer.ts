import { GridLayer, withLeaflet, TileLayerProps } from "react-leaflet";
import { LeafletPouchDBTileLayer } from "./pouchdb-tilelayer";
import { PouchDBTileLayerOptions } from "./type";

export type PouchDBTileLayerProps = PouchDBTileLayerOptions & TileLayerProps;

class PouchDBTileLayer extends GridLayer<
  PouchDBTileLayerProps,
  LeafletPouchDBTileLayer
> {
  static defaultProps: Partial<PouchDBTileLayerProps> = {
    useCache: true,
    saveToCache: true,
    useOnlyCache: false,
    cacheFormat: "image/png",
    cacheMaxAge: 1 * 3600 * 1000,
    cacheNextZoomLevel: true,
  };

  public createLeafletElement(props: PouchDBTileLayerProps) {
    const el = new LeafletPouchDBTileLayer(props.url, this.getOptions(props));
    // this.contextValue = props.leaflet;
    return el;
  }

  public updateLeafletElement(
    fromProps: PouchDBTileLayerProps,
    toProps: PouchDBTileLayerProps
  ) {
    super.updateLeafletElement(fromProps, toProps);
    if (toProps.url !== fromProps.url) {
      this.leafletElement.setUrl(toProps.url);
    }
  }
}

const ReactPouchDBTileLayer = withLeaflet(PouchDBTileLayer);
ReactPouchDBTileLayer.displayName = "ReactPouchDBTileLayer";
export default ReactPouchDBTileLayer;

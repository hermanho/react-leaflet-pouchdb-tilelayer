import { TileLayerProps } from 'react-leaflet';
import {
  createTileLayerComponent,
  updateGridLayer,
  withPane,
} from '@react-leaflet/core';
import { LeafletPouchDBTileLayer } from './pouchdb-tilelayer';
import { PouchDBTileLayerOptions } from './type';

export interface PouchDBTileLayerProps
  extends PouchDBTileLayerOptions,
    TileLayerProps {}

export const ReactPouchDBTileLayer = createTileLayerComponent<
  LeafletPouchDBTileLayer,
  PouchDBTileLayerProps
>(
  function createPouchDBTileLayer({ url, ...options }, context) {
    return {
      instance: new LeafletPouchDBTileLayer(url, {
        ...withPane(options, context),
      }),
      context,
    };
  },
  function updatePouchDBTileLayer(layer, props, prevProps) {
    updateGridLayer(layer, props, prevProps);

    if (props != null && props.url !== prevProps.url) {
      layer.setUrl(props.url);
    }
  },
);

ReactPouchDBTileLayer.displayName = 'ReactPouchDBTileLayer';
export default ReactPouchDBTileLayer;

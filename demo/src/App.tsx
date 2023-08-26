import { MapContainer, TileLayer, LayersControl } from "react-leaflet";
import PouchDBTileLayer from "react-leaflet-pouchdb-tilelayer";

import "./App.css";
import "leaflet/dist/leaflet.css";

function App() {
  return (
    <MapContainer id="map" center={[22.287, 114.1694]} zoom={15}>
      <LayersControl position="topleft">
        <LayersControl.BaseLayer  name="PouchDBTileLayer">
          <PouchDBTileLayer
            profiling
            useCache
            crossOrigin
            cacheNextZoomLevel
            cacheEdgeTile={0}
            attribution='&copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer checked name="TileLayer">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
          />
        </LayersControl.BaseLayer>
      </LayersControl>
    </MapContainer>
  );
}

export default App

import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";

// react-leaflet-cluster no longer auto-configures Leaflet's default marker
// icons (breaking change in v3+) - without this, markers render as broken
// image icons, because Leaflet's default icon URLs resolve relative to its
// own CSS file, which doesn't work once bundled by Metro.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface LeafletMapMarker {
  id: string;
  lat: number;
  lon: number;
  title: string;
}

interface LeafletMapProps {
  center: { lat: number; lon: number };
  markers: LeafletMapMarker[];
  onMarkerPress: (id: string) => void;
}

export function LeafletMap({ center, markers, onMarkerPress }: LeafletMapProps) {
  return (
    <MapContainer center={[center.lat, center.lon]} zoom={12} style={{ width: "100%", height: "100%" }}>
      <TileLayer
        attribution="&copy; OpenStreetMap-Mitwirkende"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup chunkedLoading>
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lon]}
            eventHandlers={{ click: () => onMarkerPress(marker.id) }}
          >
            <Popup>{marker.title}</Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

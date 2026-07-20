import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

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

function escapeForScriptTag(json: string): string {
  return json.replace(/</g, "\\u003c");
}

function buildHtml(center: { lat: number; lon: number }, markers: LeafletMapMarker[]): string {
  const markersJson = escapeForScriptTag(JSON.stringify(markers));
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
  <style>html, body, #map { height: 100%; margin: 0; padding: 0; }</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script>
    var map = L.map('map').setView([${center.lat}, ${center.lon}], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap-Mitwirkende'
    }).addTo(map);
    var cluster = L.markerClusterGroup();
    var markers = ${markersJson};
    markers.forEach(function (marker) {
      var m = L.marker([marker.lat, marker.lon]).bindPopup(marker.title);
      m.on('click', function () {
        window.ReactNativeWebView.postMessage(marker.id);
      });
      cluster.addLayer(m);
    });
    map.addLayer(cluster);
  </script>
</body>
</html>`;
}

export function LeafletMap({ center, markers, onMarkerPress }: LeafletMapProps) {
  const html = useMemo(() => buildHtml(center, markers), [center, markers]);

  function handleMessage(event: WebViewMessageEvent) {
    onMarkerPress(event.nativeEvent.data);
  }

  return <WebView source={{ html }} style={styles.webview} onMessage={handleMessage} originWhitelist={["*"]} />;
}

const styles = StyleSheet.create({
  webview: { flex: 1 },
});

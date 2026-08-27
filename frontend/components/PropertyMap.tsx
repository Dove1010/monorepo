"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { MapListingCard } from "@/components/MapListingCard";
import type { PropertyListing } from "@/lib/propertiesApi";

// Extend PropertyListing to include optional coordinates
type PropertyWithCoords = PropertyListing & {
  latitude?: number;
  longitude?: number;
};

export interface PropertyMapProps {
  properties: PropertyWithCoords[];
  center?: [number, number];
  zoom?: number;
}

// Custom marker icon: small colored circle
const customMarkerIcon = L.divIcon({
  className: "leaflet-custom-marker",
  html: '<div style="width:20px;height:20px;background:#f97316;border:2px solid #1a1a1a;border-radius:50%;"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
});

const DEFAULT_CENTER: [number, number] = [6.5244, 3.3792]; // Lagos
const DEFAULT_ZOOM = 12;

export function PropertyMap({
  properties,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
}: PropertyMapProps) {
  // Filter to only properties that have valid coordinates
  const mappableProperties = properties.filter(
    (p): p is PropertyWithCoords & { latitude: number; longitude: number } =>
      typeof p.latitude === "number" &&
      typeof p.longitude === "number" &&
      !isNaN(p.latitude) &&
      !isNaN(p.longitude),
  );

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      {mappableProperties.map((property) => (
        <Marker
          key={property.listingId}
          position={[property.latitude, property.longitude]}
          icon={customMarkerIcon}
        >
          <Popup minWidth={240} maxWidth={240} className="leaflet-popup-no-pad">
            <MapListingCard property={property} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

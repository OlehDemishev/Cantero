"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { apiFetch } from "@/lib/api-client";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Project {
  id: string;
  name: string;
  address: string | null;
  geofenceLat: number | null;
  geofenceLng: number | null;
}

const DEFAULT_CENTER: [number, number] = [39.5, -98.35]; // continental US, only used when no project has coordinates yet
const DEFAULT_ZOOM = 4;

export function ProjectMapPanel() {
  const t = useTranslations("portfolio");
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    apiFetch<Project[]>("/projects").then(setProjects);
  }, []);

  if (!projects) return null;

  const withCoords = projects.filter((p): p is Project & { geofenceLat: number; geofenceLng: number } => p.geofenceLat !== null && p.geofenceLng !== null);

  if (withCoords.length === 0) {
    return <p className="mt-4 text-sm text-gray-400">{t("noProjectCoordinates")}</p>;
  }

  const center: [number, number] = [withCoords[0].geofenceLat, withCoords[0].geofenceLng];

  return (
    <div className="card mt-4 h-[480px] w-full overflow-hidden p-0">
      <MapContainer center={withCoords.length > 0 ? center : DEFAULT_CENTER} zoom={withCoords.length > 0 ? 10 : DEFAULT_ZOOM} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {withCoords.map((p) => (
          <Marker key={p.id} position={[p.geofenceLat, p.geofenceLng]} icon={markerIcon}>
            <Popup>
              <a href={`/projects/${p.id}`} className="font-medium text-brand-700 hover:underline">
                {p.name}
              </a>
              {p.address && <div className="mt-0.5 text-xs text-gray-500">{p.address}</div>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

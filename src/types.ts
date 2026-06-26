export interface Entrance {
  id: number;
  lat: number;
  lon: number;
}

export interface Item {
  key: string;
  name: string;
  alternateName?: string;
  abbreviation: string;
  Entrances: Entrance[];
  selectedEntrance: number;
  permitType?: string[];
}

export interface Settings {
  units: "imperial" | "metric";
  walkSpeed: number;
  saveRoute: boolean;
  showLocation: boolean;
}

export interface GraphData {
  distanceMi: number;
  distanceKm: number;
}

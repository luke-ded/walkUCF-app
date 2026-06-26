# walkUCF (Mobile)

A React Native (Expo) port of the [walkUCF](../walkUCF) web app — a virtual
walking map of the University of Central Florida that finds the fastest routes
across campus using a custom Dijkstra's algorithm. This mobile version keeps the
features and structure of the web app as close as possible, swapping only the
platform-specific layers.

## Features (parity with the web app)

- **Search** UCF buildings by name, abbreviation, or alternate name.
- **Entrance selection** — pick which building entrance to route to/from.
- **Route list** — add, reorder (▲/▼), and remove stops; clear the route.
- **Shortest-path routing** via Dijkstra's algorithm, drawn as map polylines.
- **Map options** — Buildings, Jaywalking, Parking Lots, Grass (each adds extra
  paths to the graph).
- **Current location** — show your position and route from the nearest node.
- **Tile options** — OSM Default, ESRI Satellite, Stadia, Carto.
- **Settings** — imperial/metric units, custom walking speed, show-location toggle.
- **Live time & distance** readout for the planned route.
- **Light / dark theme** and About / Error dialogs.

## Tech mapping (web → mobile)

| Web app | Mobile app |
| --- | --- |
| React + Vite | React Native + Expo (SDK 51) |
| React Leaflet | `react-native-maps` (`MapView`, `Marker`, `Polyline`, `Polygon`, `UrlTile`) |
| Tailwind CSS | `StyleSheet` + a shared theme (`src/theme.ts`) |
| `react-icons` | `@expo/vector-icons` |
| `localStorage` | `@react-native-async-storage/async-storage` behind a sync shim (`src/storage.ts`) |
| `navigator.geolocation` | `expo-location` (`src/location.ts`) |
| `js-priority-queue` | inlined binary min-heap in `src/components/Dijkstra.ts` |

The campus graph data (`coords`, `paths`, `buildingPaths`, `jaywalkingPaths`,
`parkingPaths`, `grassPaths`, `locations`) and the marker artwork are copied
unchanged from the web app, so routing results are identical.

### Storage shim

The web code reads and writes `localStorage` synchronously throughout render.
`src/storage.ts` preserves that exact API with an in-memory cache that is
hydrated from AsyncStorage once on startup (see `App.tsx`) and written through
asynchronously on every change.

## Project structure

```
src/
  App entry .......... App.tsx, index.ts
  HomePage.tsx ....... screen layout (NavBar + Map + Search + RouteList)
  theme.ts ........... color palette + ThemeContext (light/dark)
  storage.ts ......... synchronous localStorage-style shim over AsyncStorage
  location.ts ........ expo-location wrapper
  types.ts ........... shared Item / Settings / GraphData types
  components/
    NavBar.tsx       MapBox.tsx     Search.tsx     RouteList.tsx
    Settings.tsx     About.tsx      Error.tsx
    Dijkstra.ts      Nearest.ts
  json_files/ ........ campus graph + location data (copied from web)
  assets/ ............ marker icons + logo
```

## Running

```bash
npm install
npm start          # then press i (iOS), a (Android), or scan the QR in Expo Go
# or:
npm run ios
npm run android
```

> Note: `react-native-maps` works in Expo Go. On iOS the base map is Apple Maps
> with the selected tile layer overlaid; on Android it uses Google Maps. For a
> production build, create a dev/standalone build with EAS.

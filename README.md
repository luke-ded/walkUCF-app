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
- **Tile options** — Default, Satellite, and Satellite (No Labels), all native
  Apple/Google imagery.
- **Settings** — imperial/metric units, custom walking speed, show-location toggle.
- **Live time & distance** readout for the planned route.
- **Light / dark theme** and About / Error dialogs.

## Tech mapping (web → mobile)

| Web app | Mobile app |
| --- | --- |
| React + Vite | React Native + Expo (SDK 57) |
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
npm run ios        # or: npm run android
```

`npm install` runs `patch-package`, which applies `patches/` to `node_modules`
(see [Native patches](#native-patches) below). It must succeed — if it reports a
failed patch, stop and fix it rather than building.

Requires **Xcode 26 or later**. Since 28 April 2026 App Store Connect rejects any
upload not built against the iOS 26 SDK, so older Xcode versions cannot produce a
shippable build.

### Opening it in Xcode

Open the **workspace**, never the project:

```bash
xed ios/walkUCF.xcworkspace     # right
# NOT: xed ios/walkUCF.xcodeproj
```

`walkUCF.xcodeproj` on its own does not include the Pods project, so none of the
pod targets get built. The CocoaPods `.xcconfig` still applies, so the header
search paths look right and the failure is misleading — a wall of

```
module map file '…/Debug-iphoneos/Expo/Expo.modulemap' not found
AppDelegate.swift:1:17: error: no such module 'Expo'
```

after a build that lasted under a second. Xcode remembers recent projects, and
`expo prebuild` regenerates `ios/` from scratch, so it is easy to end up pointed
at the wrong container. `npm run ios` always picks the workspace.

In the "Info" section of the "Run" section of the simulation schema, make sure the
build is set to "Release"

### Native projects are generated (CNG)

`ios/` and `android/` are **not** checked in. They are generated from `app.json`
by `npx expo prebuild`, so everything that used to be hand-edited in the Xcode
project now lives in config:

| Native thing | Where it is configured |
| --- | --- |
| `Info.plist` keys | `expo.ios.infoPlist` |
| `PrivacyInfo.xcprivacy` | `expo.ios.privacyManifests` |
| Launch screen | the `expo-splash-screen` plugin |
| Location permission strings | the `expo-location` plugin |
| iPhone/iPad targeting | `expo.ios.supportsTablet` |

```bash
npm run prebuild   # regenerate ios/ and android/ from app.json
```

Never edit `ios/` directly — the next prebuild discards it. If something can't be
expressed in `app.json`, write a config plugin instead. EAS Build runs prebuild
for you, so CI needs no extra step.

#### `plugins/withoutScriptSandboxing.js`

Sets `ENABLE_USER_SCRIPT_SANDBOXING = NO`. Expo's template turns it on, but
CocoaPods' "[CP] Copy Pods Resources" phase writes a scratch file into
`Pods/` that isn't a declared output, so Xcode's script sandbox denies it:

```
error: Sandbox: bash(…) deny(1) file-write-create …/Pods/resources-to-copy-walkUCF.txt
```

This fails **device** builds in both Debug and Release — including archives —
while simulator builds pass, because they skip that phase. Don't remove the
plugin without checking a device archive still builds.

### Testing location off campus

The app geofences the map to UCF and disables *Current Location* when your fix is
more than 1 km from any campus node, so away from Orlando the location features
correctly report "You appear to be off campus". To exercise the on-campus path,
point Xcode at one of the bundled traces — **Product → Scheme → Edit Scheme →
Run → Options → Core Location**, then add `simlocation.gpx` (on campus) or
`simlocation_offcampus.gpx`. These live at the repo root because `ios/` is
regenerated.

## Native patches

`patches/react-native-maps+1.27.2.patch` is required; the app renders incorrectly
without it. It carries two unrelated fixes:

1. **A `cameraBoundary` prop** (`MKMapView.cameraBoundary`), which hard-locks
   panning to campus. Upstream has no equivalent on the 1.x line. Because
   react-native-maps sets `codegenConfig.includesGeneratedCode`, React Native does
   *not* regenerate the library's Fabric artifacts, so the prop is added in four
   places that must stay in sync: the spec (`src/specs/NativeComponentMapView.ts`),
   the shipped generated C++ (`ios/generated/RNMapsSpecs/Props.{h,cpp}`), and the
   component view (`ios/AirMaps/RNMapsMapView.mm`).
2. **Overlay ordering and tap latency** — vector overlays are added at
   `MKOverlayLevelAboveLabels` so routes stay visible under an opaque `UrlTile`,
   and the single-tap recogniser no longer waits on the double-tap recogniser,
   which used to add ~300 ms before the sheet collapsed.

`patch-package` pins the patch to the exact version in its filename, so a
react-native-maps bump fails loudly instead of silently dropping these fixes. On
an upgrade, re-port the hunks and regenerate with
`npx patch-package react-native-maps`.

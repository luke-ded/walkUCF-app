import pointsData from "../json_files/coords.json";
import pathsData from "../json_files/paths.json";
import buildingPathsData from "../json_files/buildingPaths.json";
import jaywalkingPathsData from "../json_files/jaywalkingPaths.json";
import parkingPathsData from "../json_files/parkingPaths.json";
import grassPathsData from "../json_files/grassPaths.json";

interface Point {
  id: number;
  lat: number;
  lon: number;
}

interface Path {
  id: number;
  point_id1: number;
  point_id2: number;
  dist: number;
}

interface GraphEdge {
  node: number;
  distance: number;
}

interface QItem {
  pointID: number;
  distance: number;
}

interface Result {
  distances: Map<number, number>;
  path: number[];
}

interface createResult {
  pointMap: Map<number, Point>;
  graph: GraphMap;
  pathnum: number[][];
}

type GraphMap = Map<number, GraphEdge[]>;

/**
 * Minimal binary min-heap, replacing the browser-oriented `js-priority-queue`
 * dependency used by the web app. Behavior matches: lowest `distance` first.
 */
class MinHeap {
  private heap: QItem[] = [];

  get length(): number {
    return this.heap.length;
  }

  queue(item: QItem): void {
    this.heap.push(item);
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].distance <= this.heap[i].distance) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  dequeue(): QItem {
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let i = 0;
      const n = this.heap.length;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < n && this.heap[left].distance < this.heap[smallest].distance)
          smallest = left;
        if (right < n && this.heap[right].distance < this.heap[smallest].distance)
          smallest = right;
        if (smallest === i) break;
        [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

// Create graph map
export function createGraph(
  buildings: boolean,
  jaywalking: boolean,
  grass: boolean,
  parking: boolean,
): createResult {
  const points: Point[] = pointsData as Point[];
  var paths: Path[] = pathsData as Path[];

  if (buildings) {
    var buildingPaths: Path[] = buildingPathsData as Path[];
    paths = paths.concat(buildingPaths);
  }
  if (jaywalking) {
    var jaywalkingPaths: Path[] = jaywalkingPathsData as Path[];
    paths = paths.concat(jaywalkingPaths);
  }
  if (grass) {
    var grassPaths: Path[] = grassPathsData as Path[];
    paths = paths.concat(grassPaths);
  }
  if (parking) {
    var parkingPaths: Path[] = parkingPathsData as Path[];
    paths = paths.concat(parkingPaths);
  }

  const pathnum: number[][] = [];
  const graph: GraphMap = new Map();

  var pointMap: Map<number, Point> = new Map();

  points.forEach((point) => {
    if (!graph.has(point.id)) graph.set(point.id, []);

    pointMap.set(point.id, point);
  });

  paths.forEach((path) => {
    pathnum.push([path.point_id1, path.point_id2]);
    if (graph.has(path.point_id1) && graph.has(path.point_id2)) {
      graph
        .get(path.point_id1)!
        .push({ node: path.point_id2, distance: path.dist });
      graph
        .get(path.point_id2)!
        .push({ node: path.point_id1, distance: path.dist });
    } else {
      console.error(
        "Path ID " + path.id + " contains an invalid point in createGraph.\n",
      );
      console.error(
        "point1: " + path.point_id1 + ", point2: " + path.point_id2,
      );
      return graph;
    }
  });

  return { graph, pointMap, pathnum };
}

export function dijkstra(
  graph: GraphMap,
  startID: number,
  endID: number,
): Result {
  // <nodeID, distance from start node>
  const distances: Map<number, number> = new Map();
  // <nodeID, predecessor nodeID>
  const previous: Map<number, number | null> = new Map();

  // Error check
  if (!graph.has(startID)) {
    console.error("Invalid start node ID " + startID);
    return { distances: new Map(), path: [] };
  } else if (!graph.has(endID)) {
    console.error("Invalid end node ID " + endID);
    return { distances: new Map(), path: [] };
  }

  // Initialize values
  for (var pointID of graph.keys()) {
    distances.set(pointID, Infinity);
    previous.set(pointID, null);
  }
  distances.set(startID, 0);
  previous.set(startID, null);

  var pQueue = new MinHeap();
  pQueue.queue({ pointID: startID, distance: 0 });

  // Run algorithm
  while (pQueue.length > 0) {
    var curItem: QItem = pQueue.dequeue();
    var curID = curItem.pointID;
    var curDistance = curItem.distance;

    // Optimization
    if (curDistance > distances.get(curID)!) continue;

    if (endID !== null && curID === endID) break;

    var adjs = graph.get(curID) || [];

    // Visit all adjacent nodes
    for (var edge of adjs) {
      var adjID = edge.node;
      var distance = edge.distance;

      var altDistance = curDistance + distance;
      if (altDistance < distances.get(adjID)!) {
        distances.set(adjID, altDistance);
        previous.set(adjID, curID);

        pQueue.queue({ pointID: adjID, distance: altDistance });
      }
    }
  }

  // Path reconstruction
  if (distances.get(endID)! == Infinity) {
    console.error(
      "End node " + endID + " unreachable from start node " + startID,
    );
    return { distances: new Map(), path: [] };
  }

  let cur: number | null = endID;

  var path: number[] = [];
  while (cur != null) {
    path.push(cur);
    cur = previous.get(cur)!;
  }

  path = path.reverse();

  return { distances, path };
}

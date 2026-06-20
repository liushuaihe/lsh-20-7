import type {
  RouteResult,
  RouteStrategy,
  TimePeriod,
  PathSegment,
  TransferInfo,
  TimedRouteResult,
  TimedPathSegment,
  TimedTransferInfo,
  RiskLevel,
} from '@/types/metro';
import {
  stations as allStations,
  metroLines,
  getStationById,
  getTransferChannel,
  fareConfig,
  getLineTimetable,
  transferConfig,
} from '@/data/metroNetwork';
import {
  timeStringToMinutes,
  minutesToTimeString,
} from '@/lib/utils';

interface GraphNode {
  stationId: string;
  lineId: string;
}

interface GraphEdge {
  from: GraphNode;
  to: GraphNode;
  weight: number;
  type: 'travel' | 'transfer';
  time: number;
  fare: number;
  stationCount?: number;
}

interface PathNode {
  node: GraphNode;
  prev: PathNode | null;
  edge: GraphEdge | null;
  cost: number;
  time: number;
  fare: number;
  transfers: number;
  stationCount: number;
  strategy?: RouteStrategy;
}

class PriorityQueue<T> {
  private heap: { item: T; priority: number }[] = [];

  enqueue(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp();
  }

  dequeue(): T | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0].item;
    const end = this.heap.pop();
    if (this.heap.length > 0 && end) {
      this.heap[0] = end;
      this.bubbleDown();
    }
    return top;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(): void {
    let idx = this.heap.length - 1;
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this.heap[idx].priority >= this.heap[parentIdx].priority) break;
      [this.heap[idx], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[idx]];
      idx = parentIdx;
    }
  }

  private bubbleDown(): void {
    let idx = 0;
    const length = this.heap.length;
    while (true) {
      const leftIdx = 2 * idx + 1;
      const rightIdx = 2 * idx + 2;
      let smallestIdx = idx;
      if (leftIdx < length && this.heap[leftIdx].priority < this.heap[smallestIdx].priority) {
        smallestIdx = leftIdx;
      }
      if (rightIdx < length && this.heap[rightIdx].priority < this.heap[smallestIdx].priority) {
        smallestIdx = rightIdx;
      }
      if (smallestIdx === idx) break;
      [this.heap[idx], this.heap[smallestIdx]] = [this.heap[smallestIdx], this.heap[idx]];
      idx = smallestIdx;
    }
  }
}

function nodeKey(node: GraphNode): string {
  return `${node.stationId}@${node.lineId}`;
}

function buildAdjacencyList(
  blockedStations: Set<string>,
  timePeriod: TimePeriod,
): Map<string, GraphEdge[]> {
  const adjacency = new Map<string, GraphEdge[]>();

  const peakMultiplier =
    timePeriod === 'morning-peak' || timePeriod === 'evening-peak'
      ? 1 + fareConfig.peakSurcharge
      : 1;

  for (const line of metroLines) {
    for (let i = 0; i < line.stations.length - 1; i++) {
      const fromStation = line.stations[i];
      const toStation = line.stations[i + 1];

      if (blockedStations.has(fromStation) || blockedStations.has(toStation)) continue;

      const baseTime = 3;
      const travelTime = timePeriod === 'morning-peak' || timePeriod === 'evening-peak'
        ? Math.ceil(baseTime * 1.3)
        : baseTime;

      const fare = line.baseFarePerStation * peakMultiplier;

      const forwardEdge: GraphEdge = {
        from: { stationId: fromStation, lineId: line.id },
        to: { stationId: toStation, lineId: line.id },
        weight: 0,
        type: 'travel',
        time: travelTime,
        fare,
        stationCount: 1,
      };

      const backwardEdge: GraphEdge = {
        from: { stationId: toStation, lineId: line.id },
        to: { stationId: fromStation, lineId: line.id },
        weight: 0,
        type: 'travel',
        time: travelTime,
        fare,
        stationCount: 1,
      };

      const fwdKey = nodeKey(forwardEdge.from);
      const bwdKey = nodeKey(backwardEdge.from);
      if (!adjacency.has(fwdKey)) adjacency.set(fwdKey, []);
      if (!adjacency.has(bwdKey)) adjacency.set(bwdKey, []);
      adjacency.get(fwdKey)!.push(forwardEdge);
      adjacency.get(bwdKey)!.push(backwardEdge);
    }
  }

  for (const station of allStations) {
    if (blockedStations.has(station.id)) continue;
    for (const fromLine of station.lines) {
      for (const toLine of station.lines) {
        if (fromLine === toLine) continue;
        const channel = getTransferChannel(station.id, fromLine, toLine);
        if (!channel) continue;

        let walkTime = channel.walkTime;
        if (timePeriod === 'morning-peak' || timePeriod === 'evening-peak') {
          walkTime = Math.ceil(walkTime * channel.crowdFactor);
        }

        const isHub = station.isHub;
        const transferPenalty = isHub ? fareConfig.hubTransferSurcharge : 0.5;

        const transferEdge: GraphEdge = {
          from: { stationId: station.id, lineId: fromLine },
          to: { stationId: station.id, lineId: toLine },
          weight: 0,
          type: 'transfer',
          time: walkTime,
          fare: transferPenalty * peakMultiplier,
        };

        const key = nodeKey(transferEdge.from);
        if (!adjacency.has(key)) adjacency.set(key, []);
        adjacency.get(key)!.push(transferEdge);
      }
    }
  }

  return adjacency;
}

function computeEdgeWeight(edge: GraphEdge, strategy: RouteStrategy): number {
  switch (strategy) {
    case 'shortest-time':
      return edge.type === 'transfer' ? edge.time * 1.5 : edge.time;
    case 'min-transfers':
      return edge.type === 'transfer' ? 100 : edge.stationCount ?? 1;
    case 'lowest-fare':
      return edge.fare * 10 + (edge.type === 'transfer' ? 5 : 0);
    default:
      return edge.time;
  }
}

export function findRoute(
  startStationId: string,
  endStationId: string,
  strategy: RouteStrategy,
  blockedStations: string[] = [],
  timePeriod: TimePeriod = 'off-peak',
): RouteResult | null {
  if (startStationId === endStationId) return null;

  const blocked = new Set(blockedStations);
  if (blocked.has(startStationId) || blocked.has(endStationId)) return null;

  const startStation = getStationById(startStationId);
  const endStation = getStationById(endStationId);
  if (!startStation || !endStation) return null;

  const adjacency = buildAdjacencyList(blocked, timePeriod);

  const dist = new Map<string, number>();
  const bestPath = new Map<string, PathNode>();
  const pq = new PriorityQueue<PathNode>();

  for (const lineId of startStation.lines) {
    const startNode: GraphNode = { stationId: startStationId, lineId };
    const key = nodeKey(startNode);
    const initial: PathNode = {
      node: startNode,
      prev: null,
      edge: null,
      cost: 0,
      time: 0,
      fare: fareConfig.baseFare,
      transfers: 0,
      stationCount: 0,
    };
    dist.set(key, 0);
    bestPath.set(key, initial);
    pq.enqueue(initial, 0);
  }

  let foundPath: PathNode | null = null;
  let bestCost = Infinity;

  while (!pq.isEmpty()) {
    const current = pq.dequeue();
    if (!current) break;

    const curKey = nodeKey(current.node);
    if (current.cost > (dist.get(curKey) ?? Infinity)) continue;

    if (current.node.stationId === endStationId) {
      if (current.cost < bestCost) {
        bestCost = current.cost;
        foundPath = current;
      }
      continue;
    }

    const edges = adjacency.get(curKey) ?? [];
    for (const edge of edges) {
      const toKey = nodeKey(edge.to);
      const weight = computeEdgeWeight(edge, strategy);
      const newCost = current.cost + weight;

      if (newCost < (dist.get(toKey) ?? Infinity)) {
        dist.set(toKey, newCost);
        const newNode: PathNode = {
          node: edge.to,
          prev: current,
          edge,
          cost: newCost,
          time: current.time + edge.time,
          fare: current.fare + edge.fare,
          transfers: current.transfers + (edge.type === 'transfer' ? 1 : 0),
          stationCount: current.stationCount + (edge.stationCount ?? 0),
        };
        bestPath.set(toKey, newNode);
        pq.enqueue(newNode, newCost);
      }
    }
  }

  if (!foundPath) return null;
  return buildRouteResult(foundPath, timePeriod);
}

function buildRouteResult(pathNode: PathNode, timePeriod: TimePeriod): RouteResult {
  const segments: PathSegment[] = [];
  const transfers: TransferInfo[] = [];

  const edges: GraphEdge[] = [];
  let cur: PathNode | null = pathNode;
  while (cur && cur.edge) {
    edges.unshift(cur.edge);
    cur = cur.prev;
  }

  let currentSegment: PathSegment | null = null;

  for (const edge of edges) {
    if (edge.type === 'travel') {
      if (!currentSegment || currentSegment.line !== edge.from.lineId) {
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          fromStation: edge.from.stationId,
          toStation: edge.to.stationId,
          line: edge.from.lineId,
          stationCount: edge.stationCount ?? 1,
          travelTime: edge.time,
          fare: edge.fare,
        };
      } else {
        currentSegment.toStation = edge.to.stationId;
        currentSegment.stationCount += edge.stationCount ?? 1;
        currentSegment.travelTime += edge.time;
        currentSegment.fare += edge.fare;
      }
    } else if (edge.type === 'transfer') {
      if (currentSegment) {
        segments.push(currentSegment);
        currentSegment = null;
      }
      const station = getStationById(edge.from.stationId);
      const channel = getTransferChannel(edge.from.stationId, edge.from.lineId, edge.to.lineId);
      transfers.push({
        station: edge.from.stationId,
        fromLine: edge.from.lineId,
        toLine: edge.to.lineId,
        walkTime: edge.time,
        penalty: station?.isHub ? fareConfig.hubTransferSurcharge : 0.5,
      });
      void channel;
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  let totalFare = Math.min(
    Math.max(pathNode.fare, fareConfig.minFare),
    fareConfig.maxFare,
  );
  totalFare = Math.round(totalFare * 100) / 100;

  void timePeriod;

  return {
    segments,
    transfers,
    totalTime: pathNode.time,
    totalFare,
    transferCount: pathNode.transfers,
    stationCount: pathNode.stationCount,
    strategy: pathNode.strategy ?? 'shortest-time',
  };
}

export function findAllRoutes(
  startStationId: string,
  endStationId: string,
  blockedStations: string[] = [],
  timePeriod: TimePeriod = 'off-peak',
): Map<RouteStrategy, RouteResult | null> {
  const strategies: RouteStrategy[] = ['shortest-time', 'min-transfers', 'lowest-fare'];
  const results = new Map<RouteStrategy, RouteResult | null>();

  for (const strategy of strategies) {
    const result = findRoute(startStationId, endStationId, strategy, blockedStations, timePeriod);
    if (result) {
      result.strategy = strategy;
    }
    results.set(strategy, result);
  }

  return results;
}

export function calculateNextTrainTime(
  lineId: string,
  arrivalAtStationMinutes: number,
): { boardTime: number; waitTime: number; risk: RiskLevel; riskReason?: string; lastTrainTime: number; firstTrainTime: number } {
  const timetable = getLineTimetable(lineId);
  if (!timetable) {
    return {
      boardTime: arrivalAtStationMinutes,
      waitTime: 0,
      risk: 'none',
      lastTrainTime: 24 * 60,
      firstTrainTime: 0,
    };
  }

  const firstTrain = timeStringToMinutes(timetable.firstTrain);
  const lastTrain = timeStringToMinutes(timetable.lastTrain);
  const headway = timetable.headwayMinutes;

  if (arrivalAtStationMinutes > lastTrain) {
    const missedBy = arrivalAtStationMinutes - lastTrain;
    return {
      boardTime: lastTrain,
      waitTime: -missedBy,
      risk: 'missed',
      riskReason: `末班车 ${timetable.lastTrain} 已发车，晚到 ${missedBy} 分钟`,
      lastTrainTime: lastTrain,
      firstTrainTime: firstTrain,
    };
  }

  if (arrivalAtStationMinutes <= firstTrain) {
    const waitTime = firstTrain - arrivalAtStationMinutes;
    let risk: RiskLevel = 'none';
    let riskReason: string | undefined;
    if (waitTime > 30) {
      risk = 'warning';
      riskReason = `距首班车 ${timetable.firstTrain} 还有 ${waitTime} 分钟，需等待`;
    }
    return {
      boardTime: firstTrain,
      waitTime,
      risk,
      riskReason,
      lastTrainTime: lastTrain,
      firstTrainTime: firstTrain,
    };
  }

  const minutesSinceFirst = arrivalAtStationMinutes - firstTrain;
  const intervals = Math.ceil(minutesSinceFirst / headway);
  const boardTime = firstTrain + intervals * headway;

  if (boardTime > lastTrain) {
    const missedBy = arrivalAtStationMinutes - lastTrain;
    return {
      boardTime: lastTrain,
      waitTime: -Math.max(0, missedBy),
      risk: 'missed',
      riskReason: `末班 ${timetable.lastTrain} 已发出，下一班已超出运营时间`,
      lastTrainTime: lastTrain,
      firstTrainTime: firstTrain,
    };
  }

  const waitTime = boardTime - arrivalAtStationMinutes;
  let risk: RiskLevel = 'none';
  let riskReason: string | undefined;

  const minutesToLast = lastTrain - boardTime;
  if (minutesToLast <= 15) {
    if (minutesToLast <= 5) {
      risk = 'danger';
      riskReason = `末班 ${timetable.lastTrain} 前最后 ${Math.ceil(minutesToLast / headway)} 班，赶不上将无车可乘`;
    } else {
      risk = 'warning';
      riskReason = `接近末班车时段（距末班 ${minutesToLast} 分钟）`;
    }
  }

  return {
    boardTime,
    waitTime,
    risk,
    riskReason,
    lastTrainTime: lastTrain,
    firstTrainTime: firstTrain,
  };
}

function mergeRisk(...risks: RiskLevel[]): RiskLevel {
  const order: Record<RiskLevel, number> = { none: 0, warning: 1, danger: 2, missed: 3 };
  let maxLevel: RiskLevel = 'none';
  for (const r of risks) {
    if (order[r] > order[maxLevel]) maxLevel = r;
  }
  return maxLevel;
}

function findSuggestedDeparture(
  route: RouteResult,
  originalDeparture: number,
): { suggestedDeparture: number; reason: string; direction: 'earlier' | 'later' } | null {
  const firstSeg = route.segments[0];
  const tt = getLineTimetable(firstSeg?.line ?? '');
  const firstTrainMin = tt ? timeStringToMinutes(tt.firstTrain) : 6 * 60;

  for (let dep = originalDeparture; dep >= 0; dep -= 5) {
    const result = analyzeRouteTimingInternal(route, dep, false);
    if (result.isReachable) {
      return {
        suggestedDeparture: dep,
        reason: `建议在 ${minutesToTimeString(dep)} 前出发，可全程赶上末班车`,
        direction: 'earlier',
      };
    }
  }

  for (let dep = firstTrainMin; dep <= 24 * 60; dep += 5) {
    const result = analyzeRouteTimingInternal(route, dep, false);
    if (result.isReachable) {
      return {
        suggestedDeparture: dep,
        reason: `建议 ${minutesToTimeString(dep)} 后出发，首班车后即可乘车`,
        direction: 'later',
      };
    }
  }

  return null;
}

function analyzeRouteTimingInternal(
  route: RouteResult,
  departureMinutes: number,
  computeSuggestion: boolean,
): TimedRouteResult {
  const timedSegments: TimedPathSegment[] = [];
  const timedTransfers: TimedTransferInfo[] = [];
  const missedSegments: number[] = [];
  const missedTransfers: number[] = [];

  let timeAtPlatform = departureMinutes;
  let overallRisk: RiskLevel = 'none';
  let isReachable = true;

  for (let segIdx = 0; segIdx < route.segments.length; segIdx++) {
    const segment = route.segments[segIdx];

    if (segIdx > 0) {
      const transferIdx = segIdx - 1;
      if (transferIdx < route.transfers.length) {
        const prevTransfer = route.transfers[transferIdx];
        const transferArrivalAtPlatform = timeAtPlatform + prevTransfer.walkTime;

        const nextTrain = calculateNextTrainTime(segment.line, transferArrivalAtPlatform);
        const bufferTime = nextTrain.boardTime - transferArrivalAtPlatform;

        let transferRisk: RiskLevel = 'none';
        let transferReason: string | undefined;

        if (nextTrain.risk === 'missed') {
          transferRisk = 'missed';
          transferReason = nextTrain.riskReason;
        } else if (bufferTime < transferConfig.minBufferMinutes) {
          transferRisk = 'danger';
          transferReason = `换乘缓冲仅 ${bufferTime} 分钟（最少需 ${transferConfig.minBufferMinutes} 分钟），可能赶不上`;
        } else if (bufferTime < transferConfig.defaultBufferMinutes) {
          transferRisk = 'warning';
          transferReason = `换乘缓冲 ${bufferTime} 分钟（建议 ${transferConfig.defaultBufferMinutes} 分钟），时间较紧`;
        }

        const timedTransfer: TimedTransferInfo = {
          ...prevTransfer,
          arrivalTime: timeAtPlatform,
          departureTime: transferArrivalAtPlatform,
          bufferTime,
          risk: transferRisk,
          riskReason: transferReason,
        };

        timedTransfers.push(timedTransfer);
        overallRisk = mergeRisk(overallRisk, transferRisk);
        if (transferRisk === 'missed') {
          missedTransfers.push(transferIdx);
          isReachable = false;
        }

        timeAtPlatform = transferArrivalAtPlatform;
      }
    }

    const { boardTime, waitTime, risk: boardRisk, riskReason: boardReason } =
      calculateNextTrainTime(segment.line, timeAtPlatform);

    const arrivalTime = boardTime + segment.travelTime;

    const segmentRisk = boardRisk;
    const segmentReason = boardReason;

    overallRisk = mergeRisk(overallRisk, segmentRisk);
    if (segmentRisk === 'missed') {
      missedSegments.push(segIdx);
      isReachable = false;
    }

    timedSegments.push({
      ...segment,
      boardTime,
      arrivalTime,
      waitTime,
      risk: segmentRisk,
      riskReason: segmentReason,
    });

    timeAtPlatform = arrivalTime;
  }

  let alternativeSuggestion: string | undefined;

  if (!isReachable && computeSuggestion) {
    const suggestion = findSuggestedDeparture(route, departureMinutes);
    if (suggestion) {
      alternativeSuggestion = suggestion.reason;
    } else {
      alternativeSuggestion = '该路线无法在运营时间内完成，请尝试其他策略或交通方式';
    }
  } else if (isReachable && overallRisk !== 'none') {
    alternativeSuggestion = '路线可达，但存在风险段，建议预留充足时间';
  }

  const totalTravelTime = timeAtPlatform - departureMinutes;

  return {
    ...route,
    segments: timedSegments,
    transfers: timedTransfers,
    totalTime: totalTravelTime,
    departureTime: departureMinutes,
    arrivalTime: timeAtPlatform,
    overallRisk,
    missedSegments,
    missedTransfers,
    isReachable,
    alternativeSuggestion,
  };
}

export function analyzeRouteTiming(
  route: RouteResult,
  departureMinutes: number,
): TimedRouteResult {
  return analyzeRouteTimingInternal(route, departureMinutes, true);
}

export function findTimedRoute(
  startStationId: string,
  endStationId: string,
  strategy: RouteStrategy,
  departureMinutes: number,
  blockedStations: string[] = [],
  timePeriod: TimePeriod = 'off-peak',
): TimedRouteResult | null {
  const route = findRoute(startStationId, endStationId, strategy, blockedStations, timePeriod);
  if (!route) return null;
  return analyzeRouteTiming(route, departureMinutes);
}

export function findAllTimedRoutes(
  startStationId: string,
  endStationId: string,
  departureMinutes: number,
  blockedStations: string[] = [],
  timePeriod: TimePeriod = 'off-peak',
): Map<RouteStrategy, TimedRouteResult | null> {
  const strategies: RouteStrategy[] = ['shortest-time', 'min-transfers', 'lowest-fare'];
  const results = new Map<RouteStrategy, TimedRouteResult | null>();

  for (const strategy of strategies) {
    const result = findTimedRoute(
      startStationId,
      endStationId,
      strategy,
      departureMinutes,
      blockedStations,
      timePeriod,
    );
    results.set(strategy, result);
  }

  return results;
}

export { type GraphNode, type GraphEdge };

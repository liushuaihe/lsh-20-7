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
  getLineById,
  getTransferChannel,
  fareConfig,
  getLineTimetable,
  transferConfig,
} from '@/data/metroNetwork';
import {
  timeStringToMinutes,
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
): { boardTime: number; waitTime: number; risk: RiskLevel; riskReason?: string } {
  const timetable = getLineTimetable(lineId);
  if (!timetable) {
    return {
      boardTime: arrivalAtStationMinutes,
      waitTime: 0,
      risk: 'none',
    };
  }

  const firstTrain = timeStringToMinutes(timetable.firstTrain);
  const lastTrain = timeStringToMinutes(timetable.lastTrain);
  const headway = timetable.headwayMinutes;

  if (arrivalAtStationMinutes >= lastTrain) {
    const missedBy = arrivalAtStationMinutes - lastTrain;
    return {
      boardTime: lastTrain,
      waitTime: 0,
      risk: 'missed',
      riskReason: `到达时已过末班车时间（末班 ${timetable.lastTrain}，晚到 ${missedBy} 分钟）`,
    };
  }

  if (arrivalAtStationMinutes <= firstTrain) {
    const waitTime = firstTrain - arrivalAtStationMinutes;
    let risk: RiskLevel = 'none';
    let riskReason: string | undefined;
    if (waitTime > 30) {
      risk = 'warning';
      riskReason = `距离首班车还有 ${waitTime} 分钟`;
    }
    return {
      boardTime: firstTrain,
      waitTime,
      risk,
      riskReason,
    };
  }

  const minutesSinceFirst = arrivalAtStationMinutes - firstTrain;
  const intervals = Math.ceil(minutesSinceFirst / headway);
  const boardTime = firstTrain + intervals * headway;

  if (boardTime > lastTrain) {
    return {
      boardTime: lastTrain,
      waitTime: Math.max(0, lastTrain - arrivalAtStationMinutes),
      risk: 'missed',
      riskReason: `下一班车已超过末班时间（末班 ${timetable.lastTrain}）`,
    };
  }

  const waitTime = boardTime - arrivalAtStationMinutes;
  let risk: RiskLevel = 'none';
  let riskReason: string | undefined;

  const minutesToLast = lastTrain - boardTime;
  if (minutesToLast <= 15) {
    if (minutesToLast <= 5) {
      risk = 'danger';
      riskReason = `末班车前最后一班，赶不上将无车可乘（剩余 ${minutesToLast} 分钟）`;
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

export function analyzeRouteTiming(
  route: RouteResult,
  departureMinutes: number,
): TimedRouteResult {
  const timedSegments: TimedPathSegment[] = [];
  const timedTransfers: TimedTransferInfo[] = [];
  const missedSegments: number[] = [];
  const missedTransfers: number[] = [];

  let currentTime = departureMinutes;
  let overallRisk: RiskLevel = 'none';
  let isReachable = true;

  for (let segIdx = 0; segIdx < route.segments.length; segIdx++) {
    const segment = route.segments[segIdx];
    const line = getLineById(segment.line);

    const { boardTime, waitTime, risk: boardRisk, riskReason: boardReason } = calculateNextTrainTime(
      segment.line,
      currentTime,
    );

    if (segIdx > 0) {
      const transferIdx = segIdx - 1;
      if (transferIdx < route.transfers.length) {
        const prevTransfer = route.transfers[transferIdx];
        const timedTransfer: TimedTransferInfo = {
          ...prevTransfer,
          arrivalTime: currentTime - prevTransfer.walkTime,
          departureTime: currentTime,
          bufferTime: boardTime - currentTime,
          risk: boardRisk === 'missed' ? 'missed' : 'none',
          riskReason: boardRisk === 'missed' ? boardReason : undefined,
        };

        if (timedTransfer.bufferTime < transferConfig.minBufferMinutes && boardRisk !== 'missed') {
          timedTransfer.risk = 'danger';
          timedTransfer.riskReason = `换乘缓冲时间不足（仅 ${timedTransfer.bufferTime} 分钟，最少需要 ${transferConfig.minBufferMinutes} 分钟）`;
        } else if (timedTransfer.bufferTime < transferConfig.defaultBufferMinutes && boardRisk !== 'missed') {
          timedTransfer.risk = 'warning';
          timedTransfer.riskReason = `换乘缓冲时间较紧（${timedTransfer.bufferTime} 分钟，建议 ${transferConfig.defaultBufferMinutes} 分钟）`;
        }

        timedTransfers.push(timedTransfer);
        overallRisk = mergeRisk(overallRisk, timedTransfer.risk);
        if (timedTransfer.risk === 'missed') {
          missedTransfers.push(transferIdx);
          isReachable = false;
        }
      }
    }

    const arrivalTime = boardTime + segment.travelTime;

    let segmentRisk = boardRisk;
    let segmentReason = boardReason;

    if (line) {
      const endIdx = line.stations.indexOf(segment.toStation);
      const startIdx = line.stations.indexOf(segment.fromStation);
      const direction = endIdx >= startIdx ? 1 : -1;
      const terminalStationIdx = direction === 1 ? line.stations.length - 1 : 0;
      const stationsBeforeTerminal = Math.abs(terminalStationIdx - endIdx);
      const timetable = getLineTimetable(segment.line);

      if (timetable && stationsBeforeTerminal <= 2 && segmentRisk !== 'missed') {
        const lastTrain = timeStringToMinutes(timetable.lastTrain);
        const arrivalAtTerminal = boardTime + Math.abs(terminalStationIdx - startIdx) * 3;
        if (arrivalAtTerminal > lastTrain) {
          segmentRisk = 'missed';
          segmentReason = `乘坐区间超过末班车到达终点站时间（末班 ${timetable.lastTrain}）`;
          isReachable = false;
        }
      }
    }

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

    currentTime = arrivalTime;
  }

  let alternativeSuggestion: string | undefined;
  if (!isReachable) {
    const firstSegment = route.segments[0];
    const timetable = getLineTimetable(firstSegment?.line ?? '');
    if (timetable) {
      alternativeSuggestion = `建议在 ${timetable.firstTrain} 之前出发，或选择更早的交通方式`;
    }

    if (overallRisk === 'missed' && missedSegments.length === 0 && missedTransfers.length > 0) {
      alternativeSuggestion = '换乘时间不足，建议选择换乘更少的路线';
    }
  }

  const totalTravelTime = currentTime - departureMinutes;

  return {
    ...route,
    segments: timedSegments,
    transfers: timedTransfers,
    totalTime: totalTravelTime,
    departureTime: departureMinutes,
    arrivalTime: currentTime,
    overallRisk,
    missedSegments,
    missedTransfers,
    isReachable,
    alternativeSuggestion,
  };
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

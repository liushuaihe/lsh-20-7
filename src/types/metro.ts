export type RouteStrategy = 'shortest-time' | 'min-transfers' | 'lowest-fare';

export type TimePeriod = 'morning-peak' | 'evening-peak' | 'off-peak';

export type RiskLevel = 'none' | 'warning' | 'danger' | 'missed';

export interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
  lines: string[];
  isHub: boolean;
}

export interface LineTimetable {
  lineId: string;
  firstTrain: string;
  lastTrain: string;
  headwayMinutes: number;
}

export interface TransferConfig {
  minBufferMinutes: number;
  defaultBufferMinutes: number;
}

export interface MetroLine {
  id: string;
  name: string;
  color: string;
  stations: string[];
  baseFarePerStation: number;
}

export interface TransferChannel {
  fromStation: string;
  toStation: string;
  fromLine: string;
  toLine: string;
  walkTime: number;
  crowdFactor: number;
}

export interface Edge {
  from: string;
  to: string;
  line: string;
  baseTime: number;
}

export interface PathSegment {
  fromStation: string;
  toStation: string;
  line: string;
  stationCount: number;
  travelTime: number;
  fare: number;
}

export interface TimedPathSegment extends PathSegment {
  boardTime: number;
  arrivalTime: number;
  waitTime: number;
  risk: RiskLevel;
  riskReason?: string;
}

export interface TransferInfo {
  station: string;
  fromLine: string;
  toLine: string;
  walkTime: number;
  penalty: number;
}

export interface TimedTransferInfo extends TransferInfo {
  arrivalTime: number;
  departureTime: number;
  bufferTime: number;
  risk: RiskLevel;
  riskReason?: string;
}

export interface RouteResult {
  segments: PathSegment[];
  transfers: TransferInfo[];
  totalTime: number;
  totalFare: number;
  transferCount: number;
  stationCount: number;
  strategy: RouteStrategy;
}

export interface TimedRouteResult extends RouteResult {
  segments: TimedPathSegment[];
  transfers: TimedTransferInfo[];
  departureTime: number;
  arrivalTime: number;
  overallRisk: RiskLevel;
  missedSegments: number[];
  missedTransfers: number[];
  isReachable: boolean;
  alternativeSuggestion?: string;
}

export interface FareConfig {
  baseFare: number;
  perStationRate: number;
  peakSurcharge: number;
  hubTransferSurcharge: number;
  maxFare: number;
  minFare: number;
}

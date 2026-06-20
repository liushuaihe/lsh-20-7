import { create } from 'zustand';
import type { TimedRouteResult, RouteStrategy, TimePeriod } from '@/types/metro';
import { findAllTimedRoutes } from '@/lib/pathfinding';
import { getDefaultDepartureMinutes } from '@/lib/utils';

interface MetroState {
  startStationId: string | null;
  endStationId: string | null;
  selectedStrategy: RouteStrategy;
  timePeriod: TimePeriod;
  departureMinutes: number;
  blockedStations: string[];
  routeResults: Map<RouteStrategy, TimedRouteResult | null>;
  highlightedRoute: TimedRouteResult | null;
  isCalculating: boolean;
  error: string | null;

  setStartStation: (id: string | null) => void;
  setEndStation: (id: string | null) => void;
  setSelectedStrategy: (strategy: RouteStrategy) => void;
  setTimePeriod: (period: TimePeriod) => void;
  setDepartureMinutes: (minutes: number) => void;
  toggleBlockedStation: (id: string) => void;
  clearBlockedStations: () => void;
  calculateRoutes: () => void;
  setHighlightedRoute: (route: TimedRouteResult | null) => void;
  resetAll: () => void;
}

export const useMetroStore = create<MetroState>((set, get) => ({
  startStationId: null,
  endStationId: null,
  selectedStrategy: 'shortest-time',
  timePeriod: 'off-peak',
  departureMinutes: getDefaultDepartureMinutes(),
  blockedStations: [],
  routeResults: new Map(),
  highlightedRoute: null,
  isCalculating: false,
  error: null,

  setStartStation: (id) => {
    set({ startStationId: id, routeResults: new Map(), highlightedRoute: null, error: null });
  },

  setEndStation: (id) => {
    set({ endStationId: id, routeResults: new Map(), highlightedRoute: null, error: null });
  },

  setSelectedStrategy: (strategy) => {
    set({ selectedStrategy: strategy });
    const results = get().routeResults;
    const route = results.get(strategy) ?? null;
    set({ highlightedRoute: route });
  },

  setTimePeriod: (period) => {
    set({ timePeriod: period, routeResults: new Map(), highlightedRoute: null });
  },

  setDepartureMinutes: (minutes) => {
    set({ departureMinutes: minutes, routeResults: new Map(), highlightedRoute: null });
  },

  toggleBlockedStation: (id) => {
    const { blockedStations } = get();
    const exists = blockedStations.includes(id);
    const newBlocked = exists
      ? blockedStations.filter((s) => s !== id)
      : [...blockedStations, id];
    set({ blockedStations: newBlocked, routeResults: new Map(), highlightedRoute: null });
  },

  clearBlockedStations: () => {
    set({ blockedStations: [], routeResults: new Map(), highlightedRoute: null });
  },

  calculateRoutes: () => {
    const { startStationId, endStationId, blockedStations, timePeriod, selectedStrategy, departureMinutes } = get();

    if (!startStationId || !endStationId) {
      set({ error: '请先选择起点和终点' });
      return;
    }

    if (startStationId === endStationId) {
      set({ error: '起点和终点不能相同' });
      return;
    }

    set({ isCalculating: true, error: null });

    try {
      const results = findAllTimedRoutes(startStationId, endStationId, departureMinutes, blockedStations, timePeriod);

      const hasAnyResult = Array.from(results.values()).some((r) => r !== null);

      if (!hasAnyResult) {
        set({
          isCalculating: false,
          error: '无法找到可用路线，可能存在站点封锁导致路径中断',
          routeResults: new Map(),
          highlightedRoute: null,
        });
        return;
      }

      const highlighted = results.get(selectedStrategy) ?? null;

      set({
        isCalculating: false,
        routeResults: results,
        highlightedRoute: highlighted,
      });
    } catch {
      set({
        isCalculating: false,
        error: '路线计算出错，请重试',
      });
    }
  },

  setHighlightedRoute: (route) => {
    set({ highlightedRoute: route });
  },

  resetAll: () => {
    set({
      startStationId: null,
      endStationId: null,
      selectedStrategy: 'shortest-time',
      timePeriod: 'off-peak',
      departureMinutes: getDefaultDepartureMinutes(),
      blockedStations: [],
      routeResults: new Map(),
      highlightedRoute: null,
      isCalculating: false,
      error: null,
    });
  },
}));

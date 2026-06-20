import { useMemo, useRef, useState } from 'react';
import { MapPin, Lock, Star } from 'lucide-react';
import { stations, metroLines, getStationById, getLineById } from '@/data/metroNetwork';
import { useMetroStore } from '@/store/metroStore';
import type { Station } from '@/types/metro';
import { cn } from '@/lib/utils';

type StationSelectionMode = 'start' | 'end' | 'block' | null;

export default function MetroMap() {
  const {
    startStationId,
    endStationId,
    blockedStations,
    highlightedRoute,
    setStartStation,
    setEndStation,
    toggleBlockedStation,
  } = useMetroStore();

  const [selectionMode, setSelectionMode] = useState<StationSelectionMode>(null);
  const [hoveredStation, setHoveredStation] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const pathStationIds = useMemo(() => {
    if (!highlightedRoute) return new Set<string>();
    const ids = new Set<string>();
    for (const segment of highlightedRoute.segments) {
      const line = getLineById(segment.line);
      if (!line) continue;
      const startIdx = line.stations.indexOf(segment.fromStation);
      const endIdx = line.stations.indexOf(segment.toStation);
      if (startIdx === -1 || endIdx === -1) continue;
      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);
      for (let i = minIdx; i <= maxIdx; i++) {
        ids.add(line.stations[i]);
      }
    }
    for (const transfer of highlightedRoute.transfers) {
      ids.add(transfer.station);
    }
    return ids;
  }, [highlightedRoute]);

  const pathSegments = useMemo(() => {
    if (!highlightedRoute) return [];
    const result: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
    for (const segment of highlightedRoute.segments) {
      const line = getLineById(segment.line);
      if (!line) continue;
      const startIdx = line.stations.indexOf(segment.fromStation);
      const endIdx = line.stations.indexOf(segment.toStation);
      if (startIdx === -1 || endIdx === -1) continue;
      const step = startIdx < endIdx ? 1 : -1;
      for (let i = startIdx; i !== endIdx; i += step) {
        const s1 = getStationById(line.stations[i]);
        const s2 = getStationById(line.stations[i + 1]);
        if (!s1 || !s2) continue;
        result.push({ x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y, color: line.color });
      }
    }
    return result;
  }, [highlightedRoute]);

  const handleStationClick = (station: Station) => {
    if (selectionMode === 'start') {
      setStartStation(station.id);
      setSelectionMode(null);
    } else if (selectionMode === 'end') {
      setEndStation(station.id);
      setSelectionMode(null);
    } else if (selectionMode === 'block') {
      toggleBlockedStation(station.id);
    }
  };

  const isBlocked = (id: string) => blockedStations.includes(id);

  const getStationStatus = (id: string) => {
    if (id === startStationId) return 'start';
    if (id === endStationId) return 'end';
    if (isBlocked(id)) return 'blocked';
    if (pathStationIds.has(id)) return 'on-path';
    return 'normal';
  };

  const renderStation = (station: Station) => {
    const status = getStationStatus(station.id);
    const isHovered = hoveredStation === station.id;
    const lineColors = station.lines.map((l) => getLineById(l)?.color ?? '#888');

    let bgColor = '#ffffff';
    let strokeColor = '#475569';
    let radius = station.isHub ? 14 : 10;

    switch (status) {
      case 'start':
        bgColor = '#22c55e';
        strokeColor = '#16a34a';
        radius = 18;
        break;
      case 'end':
        bgColor = '#ef4444';
        strokeColor = '#dc2626';
        radius = 18;
        break;
      case 'blocked':
        bgColor = '#1e293b';
        strokeColor = '#0f172a';
        break;
      case 'on-path':
        bgColor = '#fbbf24';
        strokeColor = '#f59e0b';
        radius = station.isHub ? 15 : 12;
        break;
      default:
        break;
    }

    return (
      <g
        key={station.id}
        className="cursor-pointer"
        onClick={() => handleStationClick(station)}
        onMouseEnter={() => setHoveredStation(station.id)}
        onMouseLeave={() => setHoveredStation(null)}
      >
        {station.isHub && (
          <>
            {lineColors.map((color, i) => {
              const angle = (i / lineColors.length) * Math.PI * 2 - Math.PI / 2;
              const ox = Math.cos(angle) * (radius + 6);
              const oy = Math.sin(angle) * (radius + 6);
              return (
                <circle
                  key={i}
                  cx={station.x + ox}
                  cy={station.y + oy}
                  r={4}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              );
            })}
          </>
        )}

        <circle
          cx={station.x}
          cy={station.y}
          r={radius}
          fill={bgColor}
          stroke={strokeColor}
          strokeWidth={2.5}
          className={cn(
            'transition-all duration-200',
            isHovered && 'opacity-90',
            selectionMode && !isBlocked(status === 'normal' ? station.id : '') && 'animate-pulse',
          )}
        />

        {status === 'start' && (
          <text
            x={station.x}
            y={station.y + 4}
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            fill="#fff"
          >
            起
          </text>
        )}
        {status === 'end' && (
          <text
            x={station.x}
            y={station.y + 4}
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            fill="#fff"
          >
            终
          </text>
        )}
        {status === 'blocked' && (
          <text
            x={station.x}
            y={station.y + 4}
            textAnchor="middle"
            fontSize="10"
            fill="#ef4444"
          >
            ✕
          </text>
        )}

        {(isHovered || status !== 'normal') && (
          <g>
            <rect
              x={station.x - 36}
              y={station.y - radius - 26}
              width={72}
              height={20}
              rx={4}
              fill="rgba(15, 23, 42, 0.9)"
            />
            <text
              x={station.x}
              y={station.y - radius - 12}
              textAnchor="middle"
              fontSize="11"
              fontWeight="500"
              fill="#fff"
            >
              {station.name}
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectionMode(selectionMode === 'start' ? null : 'start')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
            selectionMode === 'start'
              ? 'bg-green-500 text-white shadow-lg shadow-green-200'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-green-50 hover:border-green-300',
          )}
        >
          <MapPin size={14} className="text-green-500" />
          选择起点
        </button>
        <button
          onClick={() => setSelectionMode(selectionMode === 'end' ? null : 'end')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
            selectionMode === 'end'
              ? 'bg-red-500 text-white shadow-lg shadow-red-200'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-red-50 hover:border-red-300',
          )}
        >
          <MapPin size={14} className="text-red-500" />
          选择终点
        </button>
        <button
          onClick={() => setSelectionMode(selectionMode === 'block' ? null : 'block')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
            selectionMode === 'block'
              ? 'bg-slate-800 text-white shadow-lg shadow-slate-300'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100',
          )}
        >
          <Lock size={14} />
          封锁站点
        </button>
        {selectionMode && (
          <button
            onClick={() => setSelectionMode(null)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
          >
            取消
          </button>
        )}
      </div>

      {selectionMode && (
        <div className="absolute top-3 right-3 z-10 px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-lg text-sm text-amber-800 font-medium">
          {selectionMode === 'start' && '点击地图上的站点设置起点'}
          {selectionMode === 'end' && '点击地图上的站点设置终点'}
          {selectionMode === 'block' && '点击站点切换封锁状态'}
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 bg-white/90 backdrop-blur rounded-xl p-3 border border-slate-200 shadow-sm">
        <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
          <Star size={12} />
          图例
        </div>
        {metroLines.map((line) => (
          <div key={line.id} className="flex items-center gap-2 text-xs text-slate-600">
            <span
              className="inline-block w-5 h-1.5 rounded-full"
              style={{ backgroundColor: line.color }}
            />
            {line.name}
          </div>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 900 700"
        className="w-full h-full"
        style={{ minHeight: '500px' }}
      >
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="900" height="700" fill="url(#grid)" />

        {metroLines.map((line) => {
          const pathPoints: string[] = [];
          for (let i = 0; i < line.stations.length; i++) {
            const station = getStationById(line.stations[i]);
            if (station) {
              pathPoints.push(`${station.x},${station.y}`);
            }
          }
          return (
            <polyline
              key={line.id}
              points={pathPoints.join(' ')}
              fill="none"
              stroke={line.color}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.35}
            />
          );
        })}

        {pathSegments.map((seg, i) => (
          <line
            key={`path-${i}`}
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            stroke={seg.color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
        ))}

        {stations.map(renderStation)}
      </svg>
    </div>
  );
}

import {
  Clock,
  Repeat,
  DollarSign,
  Navigation,
  Ticket,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Train,
  Timer,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';
import { useMetroStore } from '@/store/metroStore';
import { getStationById, getLineById, fareConfig, lineTimetables } from '@/data/metroNetwork';
import type { TimedRouteResult, RouteStrategy, RiskLevel } from '@/types/metro';
import { cn, minutesToTimeString } from '@/lib/utils';

const strategyLabels: Record<RouteStrategy, string> = {
  'shortest-time': '最短时间',
  'min-transfers': '最少换乘',
  'lowest-fare': '最低票价',
};

const riskConfig: Record<RiskLevel, { icon: typeof CheckCircle2; label: string; textColor: string; bgColor: string; borderColor: string; dotColor: string }> = {
  none: {
    icon: CheckCircle2,
    label: '全程可达',
    textColor: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
  warning: {
    icon: AlertCircle,
    label: '有风险',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    dotColor: 'bg-amber-500',
  },
  danger: {
    icon: AlertTriangle,
    label: '高风险',
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    dotColor: 'bg-orange-500',
  },
  missed: {
    icon: XCircle,
    label: '赶不上',
    textColor: 'text-rose-700',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    dotColor: 'bg-rose-500',
  },
};

function RiskBadge({ level, size = 'sm' }: { level: RiskLevel; size?: 'sm' | 'md' }) {
  const cfg = riskConfig[level];
  const Icon = cfg.icon;
  const sizeCls = size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border', cfg.bgColor, cfg.textColor, cfg.borderColor)}>
      <Icon className={sizeCls} />
      {cfg.label}
    </span>
  );
}

function FareBreakdown({ route }: { route: TimedRouteResult }) {
  const stationFare = route.segments.reduce((sum, s) => sum + s.fare, 0);
  const transferFare = route.transfers.reduce((sum, t) => sum + t.penalty, 0);

  return (
    <div className="mt-3 pt-3 border-t border-dashed border-slate-200 space-y-1.5">
      <div className="flex justify-between text-xs text-slate-500">
        <span>基础票价</span>
        <span>¥{fareConfig.baseFare.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>里程费（{route.stationCount}站）</span>
        <span>¥{(stationFare).toFixed(2)}</span>
      </div>
      {route.transfers.length > 0 && (
        <div className="flex justify-between text-xs text-slate-500">
          <span>换乘附加费（{route.transfers.length}次）</span>
          <span>¥{transferFare.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm font-bold text-slate-800 pt-1">
        <span>总计</span>
        <span>¥{route.totalFare.toFixed(2)}</span>
      </div>
    </div>
  );
}

function TimetableReference() {
  return (
    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
        <Train size={12} />
        各线路运营时间参考
      </div>
      <div className="grid grid-cols-2 gap-1">
        {lineTimetables.map((t) => (
          <div key={t.lineId} className="text-[11px] text-slate-600 flex justify-between bg-white px-2 py-1 rounded">
            <span className="font-medium">{t.lineId}线</span>
            <span className="text-slate-500">
              {t.firstTrain}-{t.lastTrain} · {t.headwayMinutes}分
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RouteCard({
  route,
  isActive,
  onClick,
}: {
  route: TimedRouteResult;
  isActive: boolean;
  onClick: () => void;
}) {
  const risk = riskConfig[route.overallRisk];

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border p-4 transition-all relative overflow-hidden',
        isActive
          ? 'border-indigo-400 bg-indigo-50 shadow-md ring-2 ring-indigo-200'
          : cn(
              'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300',
              route.overallRisk === 'missed' && !isActive && 'border-rose-200 bg-rose-50/30',
            ),
      )}
    >
      {route.overallRisk === 'missed' && (
        <div className="absolute top-0 right-0 w-24 h-24 -translate-y-8 translate-x-8 opacity-5 pointer-events-none">
          <XCircle size={96} className="text-rose-500" strokeWidth={1.5} />
        </div>
      )}

      <div className="flex items-center justify-between mb-2 relative z-10">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'px-2 py-0.5 rounded-md text-xs font-bold',
              isActive ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-700',
            )}
          >
            {strategyLabels[route.strategy]}
          </span>
          <RiskBadge level={route.overallRisk} />
        </div>
        {isActive && <ChevronRight size={16} className="text-indigo-500" />}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-1 relative z-10">
        <div className="flex items-center gap-1 text-sm">
          <Clock size={14} className="text-blue-500" />
          <span className="font-bold text-slate-800">{route.totalTime}</span>
          <span className="text-xs text-slate-500">分钟</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Repeat size={14} className="text-amber-500" />
          <span className="font-bold text-slate-800">{route.transferCount}</span>
          <span className="text-xs text-slate-500">次换乘</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <DollarSign size={14} className="text-green-500" />
          <span className="font-bold text-slate-800">¥{route.totalFare.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs relative z-10">
        <span className="text-slate-400">途经 {route.stationCount} 站</span>
        <span className={cn('font-medium', risk.textColor)}>
          {minutesToTimeString(route.departureTime)} → {minutesToTimeString(route.arrivalTime)}
        </span>
      </div>
    </button>
  );
}

function RouteTimeline({ route }: { route: TimedRouteResult }) {
  const elements: JSX.Element[] = [];
  let segmentIndex = 0;
  let transferIndex = 0;
  let hasMissed = false;

  const totalSteps = route.segments.length + route.transfers.length;

  for (let i = 0; i < totalSteps; i++) {
    if (i % 2 === 0) {
      const segment = route.segments[segmentIndex];
      const line = getLineById(segment.line);
      const fromStation = getStationById(segment.fromStation);
      const toStation = getStationById(segment.toStation);
      const risk = riskConfig[segment.risk];
      const isMissed = segment.risk === 'missed';
      const isDanger = segment.risk === 'danger';
      const isWarning = segment.risk === 'warning';
      const afterMissed = hasMissed && !isMissed;

      const lineColor = line?.color ?? '#888';

      if (isMissed) hasMissed = true;

      elements.push(
        <div
          key={`seg-${i}`}
          className={cn(
            'flex gap-3 rounded-lg p-2 -mx-2 mb-1 transition-opacity',
            isMissed && 'bg-rose-50 border border-rose-200',
            isDanger && 'bg-orange-50/60 border border-orange-200',
            isWarning && 'bg-amber-50/60 border border-amber-200',
            afterMissed && 'opacity-40 bg-slate-50 border border-dashed border-slate-300',
          )}
        >
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'w-4 h-4 rounded-full border-2 border-white shadow relative z-10',
                isMissed && 'ring-2 ring-rose-300 ring-offset-1 animate-pulse',
                afterMissed && 'bg-slate-300',
              )}
              style={{ backgroundColor: afterMissed ? undefined : lineColor }}
            />
            <div
              className={cn(
                'w-0.5 flex-1 my-1',
                isMissed && 'bg-rose-300',
                isDanger && 'bg-orange-300',
                isWarning && 'bg-amber-300',
                afterMissed && 'bg-slate-300 border-t border-dashed border-slate-400',
              )}
              style={{
                backgroundColor: !isMissed && !isDanger && !isWarning && !afterMissed ? lineColor : undefined,
                minHeight: 40,
              }}
            />
          </div>
          <div className="flex-1 pb-4 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Train size={14} style={{ color: afterMissed ? '#94a3b8' : lineColor }} />
              <span
                className={cn(
                  'text-xs font-bold px-2 py-0.5 rounded-md text-white',
                  isMissed && 'ring-2 ring-rose-300',
                  afterMissed && 'bg-slate-400 ring-0',
                )}
                style={{ backgroundColor: afterMissed ? undefined : lineColor }}
              >
                {line?.name.split('（')[0]}
              </span>
              {afterMissed ? (
                <span className="text-xs font-bold text-slate-400 px-2 py-0.5 rounded bg-slate-100">
                  无法乘坐
                </span>
              ) : (
                <RiskBadge level={segment.risk} />
              )}
            </div>
            <div className={cn(
              'text-sm font-medium',
              isMissed && 'text-rose-700 line-through decoration-2',
              afterMissed && 'text-slate-400',
            )}>
              {fromStation?.name} <ArrowRight size={12} className="inline" /> {toStation?.name}
            </div>
            {!afterMissed && (
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
                <span>共 {segment.stationCount} 站</span>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Timer size={10} />
                  {segment.travelTime}分钟
                </span>
                <span>·</span>
                <span>¥{segment.fare.toFixed(2)}</span>
              </div>
            )}

            {!afterMissed && (
              <div className="mt-1.5 text-xs font-medium flex items-center gap-1.5 flex-wrap">
                {isMissed ? (
                  <>
                    <span className="text-rose-600 bg-rose-100 px-2 py-0.5 rounded font-bold">
                      ⚠ 末班车 {minutesToTimeString(segment.boardTime)} 已发车
                    </span>
                    <span className="text-rose-500 text-[11px]">
                      晚到 {Math.abs(segment.waitTime)} 分钟
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                      上车 {minutesToTimeString(segment.boardTime)}
                    </span>
                    {segment.waitTime > 0 && (
                      <span className="text-slate-500">
                        (等 {segment.waitTime} 分)
                      </span>
                    )}
                    <span className="text-slate-400">→</span>
                    <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      到达 {minutesToTimeString(segment.arrivalTime)}
                    </span>
                  </>
                )}
              </div>
            )}

            {!afterMissed && !isMissed && segment.riskReason && (
              <div className={cn('mt-1.5 flex items-start gap-1 text-[11px] leading-relaxed', risk.textColor)}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{segment.riskReason}</span>
              </div>
            )}

            {afterMissed && (
              <div className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-1">
                <XCircle size={12} />
                因前段末班车已过，本段无法乘坐
              </div>
            )}
          </div>
        </div>,
      );
      segmentIndex++;
    } else {
      const transfer = route.transfers[transferIndex];
      const station = getStationById(transfer.station);
      const fromLine = getLineById(transfer.fromLine);
      const toLine = getLineById(transfer.toLine);
      const risk = riskConfig[transfer.risk];
      const isMissed = transfer.risk === 'missed';
      const isDanger = transfer.risk === 'danger';
      const isWarning = transfer.risk === 'warning';
      const afterMissed = hasMissed && !isMissed;

      if (isMissed) hasMissed = true;

      elements.push(
        <div
          key={`tr-${i}`}
          className={cn(
            'flex gap-3 rounded-lg p-2 -mx-2 mb-1 transition-opacity',
            isMissed && 'bg-rose-50 border border-rose-200',
            isDanger && 'bg-orange-50/60 border border-orange-200',
            isWarning && 'bg-amber-50/60 border border-amber-200',
            afterMissed && 'opacity-40 bg-slate-50 border border-dashed border-slate-300',
          )}
        >
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'w-4 h-4 rounded-full border-2 border-white shadow flex items-center justify-center',
                !afterMissed && 'bg-amber-400',
                afterMissed && 'bg-slate-300',
                isMissed && 'ring-2 ring-rose-300 ring-offset-1 animate-pulse',
              )}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
            <div
              className={cn(
                'w-0.5 flex-1 my-1',
                isMissed ? 'bg-rose-300' : isDanger ? 'bg-orange-300' : isWarning ? 'bg-amber-300' : afterMissed ? 'bg-slate-300' : 'bg-amber-300',
              )}
              style={{ minHeight: 40 }}
            />
          </div>
          <div className="flex-1 pb-4 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Repeat size={14} className={afterMissed ? 'text-slate-400' : 'text-amber-500'} />
              <span className={cn(
                'text-xs font-bold px-2 py-0.5 rounded-md',
                afterMissed
                  ? 'text-slate-500 bg-slate-100'
                  : 'text-amber-700 bg-amber-100',
              )}>
                换乘
              </span>
              {afterMissed ? (
                <span className="text-xs font-bold text-slate-400 px-2 py-0.5 rounded bg-slate-100">
                  无法换乘
                </span>
              ) : (
                <RiskBadge level={transfer.risk} />
              )}
            </div>
            <div className={cn(
              'text-sm font-medium',
              isMissed && 'text-rose-700 line-through decoration-2',
              afterMissed && 'text-slate-400',
            )}>
              {station?.name}
              {station?.isHub && <span className="ml-1 text-amber-500">★枢纽</span>}
            </div>
            {!afterMissed && (
              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
                <span
                  className="inline-block w-3 h-1.5 rounded-full"
                  style={{ backgroundColor: fromLine?.color }}
                />
                <ChevronRight size={10} />
                <span
                  className="inline-block w-3 h-1.5 rounded-full"
                  style={{ backgroundColor: toLine?.color }}
                />
                <span className="ml-1">步行 {transfer.walkTime} 分钟</span>
                <span>·</span>
                <span className={cn(
                  transfer.bufferTime < 0 && 'text-rose-500 font-medium',
                )}>
                  缓冲 {transfer.bufferTime >= 0 ? `${transfer.bufferTime} 分钟` : `不足 ${Math.abs(transfer.bufferTime)} 分钟`}
                </span>
              </div>
            )}

            {!afterMissed && (
              <div className="mt-1.5 text-xs font-medium flex items-center gap-1.5 flex-wrap">
                {isMissed ? (
                  <>
                    <span className="text-rose-600 bg-rose-100 px-2 py-0.5 rounded font-bold">
                      ⚠ 末班车已过，换乘失败
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                      到站 {minutesToTimeString(transfer.arrivalTime)}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                      出站 {minutesToTimeString(transfer.departureTime)}
                    </span>
                  </>
                )}
              </div>
            )}

            {!afterMissed && !isMissed && transfer.riskReason && (
              <div className={cn('mt-1.5 flex items-start gap-1 text-[11px] leading-relaxed', risk.textColor)}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{transfer.riskReason}</span>
              </div>
            )}

            {afterMissed && (
              <div className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-1">
                <XCircle size={12} />
                前段已中断，无法继续换乘
              </div>
            )}
          </div>
        </div>,
      );
      transferIndex++;
    }
  }

  if (elements.length > 0) {
    const last = route.segments[route.segments.length - 1];
    const lastStation = getStationById(last.toStation);
    const overallMissed = route.overallRisk === 'missed';
    elements.push(
      <div
        key="end"
        className={cn(
          'flex gap-3 rounded-lg p-2 -mx-2',
          overallMissed && 'bg-rose-50 border border-rose-200',
        )}
      >
        <div className="flex flex-col items-center">
          <div
            className={cn(
              'w-4 h-4 rounded-full border-2 border-white shadow',
              overallMissed
                ? 'bg-rose-500 ring-2 ring-rose-300 ring-offset-1 animate-pulse'
                : 'bg-rose-500',
            )}
          />
        </div>
        <div className="flex-1">
          <div className={cn('text-sm font-bold', overallMissed ? 'text-rose-600' : 'text-rose-600')}>
            {overallMissed ? '⚠ 无法到达终点 ' : '到达 '}
            {lastStation?.name}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {overallMissed
              ? '运营时间内无法完成本次行程'
              : `预计 ${minutesToTimeString(route.arrivalTime)} 到达`}
          </div>
        </div>
      </div>,
    );
  }

  return <div className="mt-2 space-y-1">{elements}</div>;
}

export default function RouteResults() {
  const {
    routeResults,
    highlightedRoute,
    selectedStrategy,
    setSelectedStrategy,
    setHighlightedRoute,
    departureMinutes,
  } = useMetroStore();

  const allRoutes = Array.from(routeResults.entries())
    .filter(([, r]) => r !== null)
    .map(([strategy, route]) => ({ strategy, route: route! }));

  const reachableRoutes = allRoutes.filter((r) => r.route.isReachable);
  const missedRoutes = allRoutes.filter((r) => !r.route.isReachable);

  if (allRoutes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <Navigation size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-1">等待查询</h3>
          <p className="text-sm text-slate-500 mb-4">选择起终点和策略后点击"查询路线"</p>
          <TimetableReference />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Ticket size={18} className="text-indigo-500" />
          路线方案
          <span className="ml-auto text-xs font-normal text-slate-500">
            出发时间：{minutesToTimeString(departureMinutes)}
          </span>
        </h3>

        {reachableRoutes.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium text-emerald-600 mb-2 flex items-center gap-1">
              <CheckCircle2 size={12} />
              可达路线（{reachableRoutes.length}）
            </div>
            <div className="space-y-2">
              {reachableRoutes.map(({ strategy, route }) => (
                <RouteCard
                  key={strategy}
                  route={route}
                  isActive={selectedStrategy === strategy && highlightedRoute?.strategy === strategy}
                  onClick={() => {
                    setSelectedStrategy(strategy);
                    setHighlightedRoute(route);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {missedRoutes.length > 0 && (
          <div>
            <div className="text-xs font-medium text-rose-600 mb-2 flex items-center gap-1">
              <XCircle size={12} />
              不可达路线（{missedRoutes.length}）- 末班车已过或换乘时间不足
            </div>
            <div className="space-y-2">
              {missedRoutes.map(({ strategy, route }) => (
                <RouteCard
                  key={strategy}
                  route={route}
                  isActive={selectedStrategy === strategy && highlightedRoute?.strategy === strategy}
                  onClick={() => {
                    setSelectedStrategy(strategy);
                    setHighlightedRoute(route);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {highlightedRoute && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Navigation size={18} className="text-indigo-500" />
              路线详情
            </h3>
            <div className="flex items-center gap-2">
              <RiskBadge level={highlightedRoute.overallRisk} size="md" />
              <span className="px-2.5 py-1 bg-indigo-500 text-white text-xs font-bold rounded-md">
                {strategyLabels[highlightedRoute.strategy]}
              </span>
            </div>
          </div>

          <div className={cn(
            'mb-4 p-4 rounded-xl border flex items-start gap-3',
            riskConfig[highlightedRoute.overallRisk].bgColor,
            riskConfig[highlightedRoute.overallRisk].borderColor,
          )}>
            {(() => {
              const cfg = riskConfig[highlightedRoute.overallRisk];
              const Icon = cfg.icon;
              return (
                <>
                  <Icon size={24} className={cn(cfg.textColor, 'shrink-0 mt-0.5')} />
                  <div className="flex-1">
                    <div className={cn('font-bold mb-1', cfg.textColor)}>
                      {cfg.label} · {minutesToTimeString(highlightedRoute.departureTime)} 出发 → {minutesToTimeString(highlightedRoute.arrivalTime)} 到达
                    </div>
                    {highlightedRoute.isReachable && (
                      <div className="text-xs text-slate-500 mt-1">
                      共 {highlightedRoute.stationCount} 站 · 预计耗时 {highlightedRoute.totalTime} 分钟
                    </div>
                    )}
                    {!highlightedRoute.isReachable && (
                      <div className="text-xs text-slate-500 mt-1">
                        运营时间内无法完成此行程
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          {highlightedRoute.alternativeSuggestion && (
            <div className={cn(
              'mb-4 p-4 rounded-xl border flex items-start gap-3',
              highlightedRoute.isReachable
                ? 'bg-amber-50 border-amber-200'
                : 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200',
            )}>
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0',
                highlightedRoute.isReachable
                  ? 'bg-amber-400'
                  : 'bg-gradient-to-br from-indigo-500 to-purple-600',
              )}>
                <Lightbulb size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <div className={cn(
                  'text-sm font-bold mb-1',
                  highlightedRoute.isReachable ? 'text-amber-800' : 'text-indigo-800',
                )}>
                  {highlightedRoute.isReachable ? '出行提示' : '出行建议'}
                </div>
                <p className={cn(
                  'text-sm leading-relaxed',
                  highlightedRoute.isReachable ? 'text-amber-700' : 'text-indigo-700',
                )}>
                  {highlightedRoute.alternativeSuggestion}
                </p>
                {!highlightedRoute.isReachable && (
                  <p className="text-xs text-indigo-500 mt-2">
                  💡 可在上方出发时间选择器调整出发时间查看可达路线
                </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={cn(
              'rounded-xl p-3',
              highlightedRoute.overallRisk === 'missed'
                ? 'bg-gradient-to-br from-rose-50 to-rose-100'
                : 'bg-gradient-to-br from-blue-50 to-blue-100',
            )}>
              <div className={cn(
                'flex items-center gap-1.5 text-xs font-medium mb-0.5',
                highlightedRoute.overallRisk === 'missed' ? 'text-rose-600' : 'text-blue-600',
              )}>
                <Clock size={13} /> 预计耗时
              </div>
              <div className={cn(
                'text-2xl font-bold',
                highlightedRoute.overallRisk === 'missed' ? 'text-rose-700' : 'text-blue-700',
              )}>
                {highlightedRoute.totalTime}
                <span className="text-sm font-normal ml-1">分钟</span>
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium mb-0.5">
                <DollarSign size={13} /> 票价
              </div>
              <div className="text-2xl font-bold text-green-700">
                ¥{highlightedRoute.totalFare.toFixed(2)}
              </div>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium mb-0.5">
                <Repeat size={13} /> 换乘次数
              </div>
              <div className="text-2xl font-bold text-amber-700">
                {highlightedRoute.transferCount}
                <span className="text-sm font-normal ml-1">次</span>
              </div>
            </div>
            <div className={cn(
              'rounded-xl p-3',
              highlightedRoute.overallRisk === 'missed'
                ? 'bg-gradient-to-br from-slate-50 to-slate-100'
                : 'bg-gradient-to-br from-purple-50 to-purple-100',
            )}>
              <div className={cn(
                'flex items-center gap-1.5 text-xs font-medium mb-0.5',
                highlightedRoute.overallRisk === 'missed' ? 'text-slate-600' : 'text-purple-600',
              )}>
                <Train size={13} /> 途经站点
              </div>
              <div className={cn(
                'text-2xl font-bold',
                highlightedRoute.overallRisk === 'missed' ? 'text-slate-700' : 'text-purple-700',
              )}>
                {highlightedRoute.stationCount}
                <span className="text-sm font-normal ml-1">站</span>
              </div>
            </div>
          </div>

          <RouteTimeline route={highlightedRoute} />
          <FareBreakdown route={highlightedRoute} />

          {!highlightedRoute.isReachable && (
            <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shrink-0">
                  <Lightbulb size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-indigo-800 mb-1.5">出行建议</div>
                  <ul className="text-xs text-indigo-700 space-y-1 list-disc list-inside leading-relaxed">
                    <li>请提前规划，尽量在各线路末班车前 30 分钟出发</li>
                    <li>可尝试选择换乘次数较少的策略，降低换乘风险</li>
                    <li>选择更早的出发时间，或考虑其他交通方式</li>
                    <li>高峰期发车间隔较短，平峰期发车间隔较长需注意</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {highlightedRoute.isReachable && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
              <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 leading-relaxed">
                <p className="font-semibold mb-0.5">计费规则说明</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>基础票价 ¥{fareConfig.baseFare.toFixed(2)}，每站 ¥{fareConfig.perStationRate.toFixed(2)}</li>
                  <li>枢纽换乘附加费 ¥{fareConfig.hubTransferSurcharge.toFixed(2)}，普通换乘 ¥0.50</li>
                  <li>高峰时段（早晚高峰）票价上浮 {Math.round(fareConfig.peakSurcharge * 100)}%</li>
                  <li>最低 ¥{fareConfig.minFare.toFixed(2)}，最高 ¥{fareConfig.maxFare.toFixed(2)}</li>
                </ul>
              </div>
            </div>
          )}

          <TimetableReference />
        </div>
      )}
    </div>
  );
}

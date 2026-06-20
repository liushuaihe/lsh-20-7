import { MapPin, Clock, Repeat, DollarSign, Lock, RotateCcw, Search, Sun, Sunset, Moon, X, Calendar } from 'lucide-react';
import { stations, getStationById } from '@/data/metroNetwork';
import { useMetroStore } from '@/store/metroStore';
import type { RouteStrategy, TimePeriod } from '@/types/metro';
import { cn, minutesToTimeString } from '@/lib/utils';

const strategies: { value: RouteStrategy; label: string; icon: typeof Clock; desc: string }[] = [
  { value: 'shortest-time', label: '最短时间', icon: Clock, desc: '优先总耗时最少' },
  { value: 'min-transfers', label: '最少换乘', icon: Repeat, desc: '尽量减少换乘次数' },
  { value: 'lowest-fare', label: '最低票价', icon: DollarSign, desc: '优先费用最低' },
];

const timePeriods: { value: TimePeriod; label: string; icon: typeof Sun; color: string }[] = [
  { value: 'morning-peak', label: '早高峰', icon: Sun, color: 'text-orange-500' },
  { value: 'off-peak', label: '平峰', icon: Moon, color: 'text-blue-400' },
  { value: 'evening-peak', label: '晚高峰', icon: Sunset, color: 'text-rose-500' },
];

const quickTimes = [
  { label: '现在', minutes: () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); } },
  { label: '07:00', minutes: 420 },
  { label: '09:00', minutes: 540 },
  { label: '12:00', minutes: 720 },
  { label: '18:00', minutes: 1080 },
  { label: '22:00', minutes: 1320 },
];

export default function RoutePanel() {
  const {
    startStationId,
    endStationId,
    selectedStrategy,
    timePeriod,
    departureMinutes,
    blockedStations,
    isCalculating,
    error,
    setStartStation,
    setEndStation,
    setSelectedStrategy,
    setTimePeriod,
    setDepartureMinutes,
    toggleBlockedStation,
    clearBlockedStations,
    calculateRoutes,
    resetAll,
  } = useMetroStore();

  const startStation = startStationId ? getStationById(startStationId) : null;
  const endStation = endStationId ? getStationById(endStationId) : null;

  const departureHours = Math.floor(departureMinutes / 60);
  const departureMins = departureMinutes % 60;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <MapPin size={18} className="text-indigo-500" />
          行程设置
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">起点</label>
            <select
              value={startStationId ?? ''}
              onChange={(e) => setStartStation(e.target.value || null)}
              className="w-full px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
            >
              <option value="">-- 选择起点站 --</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isHub && '★'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">终点</label>
            <select
              value={endStationId ?? ''}
              onChange={(e) => setEndStation(e.target.value || null)}
              className="w-full px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
            >
              <option value="">-- 选择终点站 --</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isHub && '★'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-2 block">时间段</label>
            <div className="grid grid-cols-3 gap-2">
              {timePeriods.map((tp) => (
                <button
                  key={tp.value}
                  onClick={() => setTimePeriod(tp.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all',
                    timePeriod === tp.value
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <tp.icon size={16} className={tp.color} />
                  {tp.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              高峰时段票价上浮30%，行程及换乘时间延长
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
              <Calendar size={12} />
              出发时间
            </label>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 flex items-center gap-1.5">
                <select
                  value={departureHours}
                  onChange={(e) => setDepartureMinutes(Number(e.target.value) * 60 + departureMins)}
                  className="flex-1 px-2 py-2 bg-cyan-50 border border-cyan-200 rounded-lg text-sm text-slate-700 font-semibold text-center focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i.toString().padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <span className="text-lg font-bold text-slate-400">:</span>
                <select
                  value={departureMins}
                  onChange={(e) => setDepartureMinutes(departureHours * 60 + Number(e.target.value))}
                  className="flex-1 px-2 py-2 bg-cyan-50 border border-cyan-200 rounded-lg text-sm text-slate-700 font-semibold text-center focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                >
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                    <option key={m} value={m}>
                      {m.toString().padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="px-3 py-2 bg-cyan-500 text-white rounded-lg text-sm font-bold shadow-sm">
                {minutesToTimeString(departureMinutes)}
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {quickTimes.map((qt) => {
                const mins = typeof qt.minutes === 'function' ? qt.minutes() : qt.minutes;
                const active = mins === departureMinutes;
                return (
                  <button
                    key={qt.label}
                    onClick={() => setDepartureMinutes(mins)}
                    className={cn(
                      'px-1 py-1.5 rounded-md text-[11px] font-medium transition-all border',
                      active
                        ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-cyan-50 hover:text-cyan-700 hover:border-cyan-200',
                    )}
                  >
                    {qt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              系统将自动检测首末班时间与换乘缓冲，标红赶不上的路段
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Search size={18} className="text-indigo-500" />
          策略选择
        </h3>
        <div className="space-y-2">
          {strategies.map((st) => {
            const Icon = st.icon;
            const active = selectedStrategy === st.value;
            return (
              <button
                key={st.value}
                onClick={() => setSelectedStrategy(st.value)}
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                  active
                    ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    active ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'text-sm font-semibold',
                      active ? 'text-indigo-700' : 'text-slate-700',
                    )}
                  >
                    {st.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{st.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Lock size={18} className="text-slate-500" />
            站点封锁
          </h3>
          {blockedStations.length > 0 && (
            <button
              onClick={clearBlockedStations}
              className="text-xs text-slate-500 hover:text-rose-500 flex items-center gap-1"
            >
              <X size={12} />
              全部清除
            </button>
          )}
        </div>
        {blockedStations.length === 0 ? (
          <p className="text-xs text-slate-400">暂无封锁站点，点击地图"封锁站点"按钮或下方站点进行封锁</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-2">
            {blockedStations.map((sid) => {
              const s = getStationById(sid);
              return (
                <button
                  key={sid}
                  onClick={() => toggleBlockedStation(sid)}
                  className="flex items-center gap-1 px-2 py-1 bg-slate-800 text-white text-xs rounded-md hover:bg-rose-600 transition-colors"
                >
                  <Lock size={10} />
                  {s?.name}
                  <X size={10} />
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-2 max-h-32 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1">
            {stations.map((s) => (
              <button
                key={s.id}
                onClick={() => toggleBlockedStation(s.id)}
                className={cn(
                  'text-left px-2 py-1.5 text-xs rounded-md transition-colors',
                  blockedStations.includes(s.id)
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100',
                )}
              >
                {s.name} {s.isHub && '★'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={calculateRoutes}
          disabled={isCalculating || !startStation || !endStation}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-200 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Search size={18} />
          {isCalculating ? '计算中...' : '查询路线'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
        >
          <RotateCcw size={18} />
          重置
        </button>
      </div>
    </div>
  );
}

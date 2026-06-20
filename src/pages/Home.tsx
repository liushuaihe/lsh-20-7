import { Train } from 'lucide-react';
import MetroMap from '@/components/MetroMap';
import RoutePanel from '@/components/RoutePanel';
import RouteResults from '@/components/RouteResults';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20">
        <div className="container px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Train size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent leading-tight">
                地铁迷踪寻路器
              </h1>
              <p className="text-xs text-slate-500">Metro Navigator · 智能图论路径规划</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs text-slate-500">
            <span className="px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded-md font-medium">
              20 站点
            </span>
            <span className="px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-md font-medium">
              6 线路
            </span>
            <span className="px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-md font-medium">
              16 换乘通道
            </span>
          </div>
        </div>
      </header>

      <main className="container px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <RoutePanel />
          </div>
          <div className="lg:col-span-6">
            <div className="h-[calc(100vh-140px)] min-h-[560px]">
              <MetroMap />
            </div>
          </div>
          <div className="lg:col-span-3 space-y-4">
            <RouteResults />
          </div>
        </div>
      </main>

      <footer className="mt-8 py-4 border-t border-slate-200 bg-white/50">
        <div className="container px-4 text-center text-xs text-slate-400">
          基于 Dijkstra 算法 · 支持最短时间 / 最少换乘 / 最低票价 多策略规划
        </div>
      </footer>
    </div>
  );
}

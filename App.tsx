import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ElderlyApp from './components/ElderlyApp';
import { SimulationType, LogEntry, SystemStatus } from './types';
import { Terminal, Activity, Bell, Smartphone, LayoutDashboard } from 'lucide-react';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'dashboard' | 'app'>('dashboard');
  const [simulation, setSimulation] = useState<SimulationType>(SimulationType.NONE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(SystemStatus.NORMAL);

  // Helper to add logs
  const addLog = useCallback((module: string, message: string, level: LogEntry['level'] = 'info') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      module,
      message,
      level,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 50));
  }, []);

  // Handle Simulation Triggers
  const handleSimulate = (type: SimulationType) => {
    setSimulation(type);
    
    switch (type) {
      case SimulationType.WANDERING:
        setSystemStatus(SystemStatus.WARNING);
        addLog('DBSCAN', '检测到地理位置聚类异常。用户偏离安全区 > 500m。', 'warn');
        break;
      case SimulationType.FALL:
        setSystemStatus(SystemStatus.CRITICAL);
        addLog('ACCELEROMETER', '检测到Y轴急剧减速 (3.2g)。身体姿态异常。', 'error');
        addLog('SYSTEM', '启动一级紧急响应协议。', 'error');
        break;
      case SimulationType.MEDICATION:
        setSystemStatus(SystemStatus.NORMAL);
        addLog('CV_CAMERA', '检测到药盒交互。置信度: 98%。', 'success');
        addLog('WATCH', '识别到“吞咽”手势。', 'success');
        break;
      default:
        setSystemStatus(SystemStatus.NORMAL);
        addLog('SYSTEM', '系统重置。监控已激活。', 'info');
    }
  };

  // Initial System Boot Log
  useEffect(() => {
    addLog('BOOT', '系统初始化完成。正在连接穿戴设备...', 'info');
    setTimeout(() => addLog('NETWORK', '5G 模组已连接。延迟: 12ms', 'success'), 800);
    setTimeout(() => addLog('AI_CORE', 'Gemini Nano 模型已加载至边缘端。', 'info'), 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden transition-all duration-300">
        
        {/* Top Navigation Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Activity className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">EmoBit <span className="text-slate-400 font-light">| 智护中心</span></h1>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveView('app')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeView === 'app' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Smartphone size={16} />
              老人端 (App)
            </button>
            <button 
              onClick={() => setActiveView('dashboard')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeView === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutDashboard size={16} />
              家属端 (后台)
            </button>
          </div>
          
          <div className="flex items-center gap-4">
             <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
               systemStatus === SystemStatus.NORMAL ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
               systemStatus === SystemStatus.WARNING ? 'bg-amber-50 text-amber-600 border-amber-200' :
               'bg-rose-50 text-rose-600 border-rose-200 animate-pulse'
             }`}>
               <div className={`w-2 h-2 rounded-full ${
                  systemStatus === SystemStatus.NORMAL ? 'bg-emerald-500' :
                  systemStatus === SystemStatus.WARNING ? 'bg-amber-500' :
                  'bg-rose-500'
               }`}></div>
               {systemStatus === SystemStatus.NORMAL ? '系统运行正常' : systemStatus === SystemStatus.WARNING ? '检测到异常行为' : '严重警报触发'}
             </div>
             <button className="relative p-2 text-slate-400 hover:text-slate-600">
               <Bell size={20} />
               {systemStatus !== SystemStatus.NORMAL && (
                 <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
               )}
             </button>
          </div>
        </header>

        {/* View Content */}
        <main className="flex-1 overflow-hidden bg-slate-50 relative">
          <div className="h-full w-full">
            {activeView === 'dashboard' ? (
              <Dashboard status={systemStatus} simulation={simulation} logs={logs} />
            ) : (
              <div className="h-full w-full overflow-y-auto p-6">
                 <ElderlyApp status={systemStatus} simulation={simulation} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;

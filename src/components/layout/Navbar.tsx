'use client';

import React from 'react';
import { Facebook, Settings, Video, CheckCircle2, AlertCircle } from 'lucide-react';
import { storage } from '@/lib/storage';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const [hasFb, setHasFb] = React.useState(false);

  React.useEffect(() => {
    setHasFb(!!storage.getFbUserToken());
  }, [activeTab]);

  return (
    <header className="h-16 px-6 mac-sidebar flex items-center justify-between sticky top-0 z-40">
      {/* App title with macOS window dots decoration */}
      <div className="flex items-center space-x-4">
        <div className="flex space-x-2 mr-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-sm"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-sm"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/80 shadow-sm"></div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              Xem View Video FB
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Fanpage Insights
              </span>
            </h1>
            <p className="text-xs text-slate-400">Thống kê lượt xem video đa Fanpage từ Facebook Graph API</p>
          </div>
        </div>
      </div>

      {/* Integration Status Badges & Quick Settings */}
      <div className="flex items-center space-x-4">
        {/* Facebook Badge */}
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
          <Facebook className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-300">Facebook API:</span>
          {hasFb ? (
            <span className="text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Đã kết nối
            </span>
          ) : (
            <span className="text-amber-400 font-medium flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Chưa Auth
            </span>
          )}
        </div>

        {/* Settings button */}
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Cấu hình FB</span>
        </button>
      </div>
    </header>
  );
};

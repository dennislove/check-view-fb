'use client';

import React from 'react';
import { Video, Settings, Layers } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const menuItems = [
    {
      id: 'video-views',
      label: 'Xem View Video',
      icon: Video,
      description: 'Thống kê lượt xem từng Fanpage',
    },
    {
      id: 'settings',
      label: 'Cấu hình FB',
      icon: Settings,
      description: 'Kết nối Facebook & Tokens',
    },
  ];

  return (
    <aside className="w-64 mac-sidebar flex flex-col justify-between p-4 min-h-[calc(100vh-4rem)]">
      <div className="space-y-6">
        <div>
          <p className="px-3 text-[10px] font-semibold tracking-wider text-slate-400 uppercase mb-2">
            Bảng điều khiển
          </p>
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-start space-x-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                    isActive
                      ? 'bg-blue-600/90 text-white shadow-lg shadow-blue-600/20 border border-blue-400/30'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Icon className={`w-5 h-5 mt-0.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{item.label}</span>
                    </div>
                    <p className={`text-[11px] truncate mt-0.5 ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer info */}
      <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
        <span>v1.0.0</span>
        <span className="flex items-center gap-1 text-slate-400">
          <Layers className="w-3 h-3 text-blue-400" /> Facebook Views
        </span>
      </div>
    </aside>
  );
};

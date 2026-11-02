'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import SettingsPage from './settings/page';
import VideoViewsPage from './video-views/page';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<string>('video-views');

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Navigation Bar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 flex overflow-hidden">
        {/* Left macOS Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Main Content Viewport */}
        <main className="flex-1 w-full overflow-y-auto p-6 max-w-7xl mx-auto space-y-6">
          {activeTab === 'video-views' && <VideoViewsPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}

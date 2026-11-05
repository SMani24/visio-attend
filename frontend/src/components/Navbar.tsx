import React from 'react';
import { ShieldCheck, Camera, UserCheck, LayoutDashboard, Eye, Lock } from 'lucide-react';

interface NavbarProps {
  currentTab: 'checkin' | 'enrollment' | 'dashboard' | 'privacy';
  setCurrentTab: (tab: 'checkin' | 'enrollment' | 'dashboard' | 'privacy') => void;
  isEnrolled: boolean;
  studentName?: string;
  sessionId: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  isEnrolled,
  studentName,
  sessionId,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Privacy Badge */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentTab('checkin')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-0.5 shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Camera className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-white tracking-tight">VisioAttend</span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                  <Lock className="w-3 h-3 mr-1" /> Zero Raw Images
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Session: <span className="font-mono text-indigo-300">{sessionId}</span></p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1 sm:space-x-2">
            <button
              onClick={() => setCurrentTab('checkin')}
              className={`flex items-center px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentTab === 'checkin'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Camera className="w-4 h-4 mr-1.5" />
              <span>Check-In</span>
            </button>

            <button
              onClick={() => setCurrentTab('enrollment')}
              className={`flex items-center px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentTab === 'enrollment'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <UserCheck className="w-4 h-4 mr-1.5" />
              <span>Enroll</span>
              {isEnrolled && (
                <span className="ml-1.5 w-2 h-2 rounded-full bg-emerald-400"></span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`flex items-center px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 mr-1.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setCurrentTab('privacy')}
              className={`flex items-center px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                currentTab === 'privacy'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border border-emerald-900/40'
              }`}
              title="Privacy Inspector: Inspect what leaves your phone"
            >
              <Eye className="w-4 h-4 mr-1.5 text-emerald-300" />
              <span className="hidden md:inline">Privacy</span> Inspector
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import { Camera, UserCheck, LayoutDashboard, Eye, Lock, ShieldCheck } from 'lucide-react';

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
    <>
      {/* Top App Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo & Privacy Badge */}
            <div
              className="flex items-center space-x-2.5 cursor-pointer select-none"
              onClick={() => setCurrentTab('checkin')}
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 p-0.5 shadow-md shadow-indigo-500/20 flex-shrink-0">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-base sm:text-lg text-white tracking-tight">VisioAttend</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                    <Lock className="w-2.5 h-2.5 mr-0.5" /> Zero Images
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-400">
                  Session: <span className="font-mono text-indigo-300">{sessionId}</span>
                </p>
              </div>
            </div>

            {/* Desktop Navigation Tabs (Hidden on small screens) */}
            <nav className="hidden sm:flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => setCurrentTab('checkin')}
                className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  currentTab === 'checkin'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Camera className="w-4 h-4 mr-1.5" />
                <span>Check-In</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('enrollment')}
                className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  currentTab === 'enrollment'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <UserCheck className="w-4 h-4 mr-1.5" />
                <span>Enroll</span>
                {isEnrolled && (
                  <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('dashboard')}
                className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  currentTab === 'dashboard'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 mr-1.5" />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('privacy')}
                className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  currentTab === 'privacy'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border border-emerald-900/40'
                }`}
              >
                <Eye className="w-4 h-4 mr-1.5 text-emerald-300" />
                <span>Privacy Inspector</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Fixed for phones) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-2xl pb-safe">
        <button
          type="button"
          onClick={() => setCurrentTab('checkin')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all min-h-[50px] ${
            currentTab === 'checkin'
              ? 'bg-indigo-600/20 text-indigo-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Camera className={`w-5 h-5 mb-0.5 ${currentTab === 'checkin' ? 'text-indigo-400' : 'text-slate-400'}`} />
          <span className="text-[11px] leading-tight">Check-In</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab('enrollment')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all min-h-[50px] relative ${
            currentTab === 'enrollment'
              ? 'bg-indigo-600/20 text-indigo-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserCheck className={`w-5 h-5 mb-0.5 ${currentTab === 'enrollment' ? 'text-indigo-400' : 'text-slate-400'}`} />
          <span className="text-[11px] leading-tight">Enroll</span>
          {isEnrolled && (
            <span className="absolute top-1.5 right-4 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-950"></span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab('dashboard')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all min-h-[50px] ${
            currentTab === 'dashboard'
              ? 'bg-indigo-600/20 text-indigo-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className={`w-5 h-5 mb-0.5 ${currentTab === 'dashboard' ? 'text-indigo-400' : 'text-slate-400'}`} />
          <span className="text-[11px] leading-tight">Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab('privacy')}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all min-h-[50px] ${
            currentTab === 'privacy'
              ? 'bg-emerald-600/20 text-emerald-400 font-semibold'
              : 'text-emerald-500/80 hover:text-emerald-300'
          }`}
        >
          <Eye className={`w-5 h-5 mb-0.5 ${currentTab === 'privacy' ? 'text-emerald-400' : 'text-emerald-500/80'}`} />
          <span className="text-[11px] leading-tight">Inspector</span>
        </button>
      </nav>
    </>
  );
};

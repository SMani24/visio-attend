import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StudentCheckIn } from './components/StudentCheckIn';
import { StudentEnrollment } from './components/StudentEnrollment';
import { ProfessorDashboard } from './components/ProfessorDashboard';
import { PrivacyInspector } from './components/PrivacyInspector';
import { AttendanceSubmissionPayload, StudentProfile } from './types/attendance';
import { getEnrolledStudent } from './services/faceVerifier';
import { waitForOpenCV } from './services/opencvLoader';
import { checkCameraCapabilities } from './services/cameraHelper';
import { AlertCircle, Lock, Info, X } from 'lucide-react';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'checkin' | 'enrollment' | 'dashboard' | 'privacy'>('checkin');
  const [sessionId, setSessionId] = useState('sess_2026_cv_01');
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [inspectorPayload, setInspectorPayload] = useState<AttendanceSubmissionPayload | null>(null);
  const [openCVLoaded, setOpenCVLoaded] = useState(false);
  const [cameraWarningDismissed, setCameraWarningDismissed] = useState(false);
  const [isHttpMobile, setIsHttpMobile] = useState(false);

  useEffect(() => {
    // Check local enrollment
    const existing = getEnrolledStudent();
    if (existing) {
      setStudentProfile(existing);
    }

    // Check camera capabilities & context
    const caps = checkCameraCapabilities();
    if (!caps.isSecureContext && !caps.canAccessCamera) {
      setIsHttpMobile(true);
    }

    // Try loading OpenCV WASM in background
    waitForOpenCV()
      .then(() => setOpenCVLoaded(true))
      .catch((err) => console.log('OpenCV loading in progress or fallback active:', err));
  }, []);

  const handleOpenPrivacyInspector = (payload: AttendanceSubmissionPayload) => {
    setInspectorPayload(payload);
    setCurrentTab('privacy');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-x-hidden w-full max-w-full">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isEnrolled={!!studentProfile?.enrolled}
        studentName={studentProfile?.full_name}
        sessionId={sessionId}
      />

      {/* Helpful Mobile Insecure Context Advisory Banner */}
      {isHttpMobile && !cameraWarningDismissed && (
        <div className="bg-amber-950/80 border-b border-amber-800/80 px-4 py-2 text-xs text-amber-200">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-start space-x-2">
              <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Mobile Notice:</strong> Connecting via HTTP. Mobile browsers disable live camera hardware without HTTPS. <strong>On-Device Simulation Mode is automatically enabled</strong> so all features work!
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCameraWarningDismissed(true)}
              className="p-1 text-amber-400 hover:text-white"
              aria-label="Dismiss notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area with safe bottom spacing for mobile bottom bar */}
      <main className="flex-1 py-4 sm:py-6 px-3 sm:px-6 pb-24 sm:pb-8 w-full max-w-full">
        {currentTab === 'checkin' && (
          <StudentCheckIn
            sessionId={sessionId}
            onOpenPrivacyInspector={handleOpenPrivacyInspector}
          />
        )}

        {currentTab === 'enrollment' && (
          <StudentEnrollment
            onEnrollmentComplete={(profile) => {
              setStudentProfile(profile);
              setCurrentTab('checkin');
            }}
          />
        )}

        {currentTab === 'dashboard' && (
          <ProfessorDashboard sessionId={sessionId} />
        )}

        {currentTab === 'privacy' && (
          <PrivacyInspector
            payload={inspectorPayload}
            onClose={() => setCurrentTab('checkin')}
          />
        )}
      </main>

      {/* Global Footer (Desktop only; on mobile bottom bar is used) */}
      <footer className="hidden sm:block border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Zero-Raw-Images Architecture Active</span>
            <span className="text-slate-700">|</span>
            <span>OpenCV.js WASM: {openCVLoaded ? 'Ready' : 'Initialized'}</span>
          </div>
          <div className="flex items-center space-x-3">
            <span>Pairwise BFMatcher + Lowe + RANSAC Consensus</span>
            <span className="text-slate-700">|</span>
            <span className="font-mono text-indigo-400">VisioAttend v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

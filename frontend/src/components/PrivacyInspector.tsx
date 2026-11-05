import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Eye, Copy, Check, FileJson, Info, ArrowLeft } from 'lucide-react';
import { AttendanceSubmissionPayload } from '../types/attendance';

interface PrivacyInspectorProps {
  payload?: AttendanceSubmissionPayload | null;
  onClose?: () => void;
}

export const PrivacyInspector: React.FC<PrivacyInspectorProps> = ({ payload, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'json'>('visual');

  // Default sample payload if none is provided yet
  const activePayload: AttendanceSubmissionPayload = payload || {
    session_id: 'sess_2026_cv_01',
    student_id: '99102345',
    student_name: 'Sara Ahmadi',
    timestamp_ms: Date.now(),
    face_proof: {
      verified: true,
      cosine_similarity: 0.842,
      liveness_action: 'BLINK_AND_YAW',
      ear_min: 0.16,
      yaw_delta_deg: 15.4,
      enrollment_commitment_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    motion_bridge: {
      camera_switch_ms: 640,
      prompted_direction: 'RIGHT',
      observed_flow_direction: 'LEFT_IMAGE_COORDS',
      direction_matched: true,
      flow_coherence: 0.89,
      mean_flow_magnitude_px: 14.2,
      tracked_points_count: 68,
    },
    scene_features: {
      frame_width: 640,
      frame_height: 480,
      redacted_faces_count: 0,
      keypoint_count: 485,
      keypoints: Array.from({ length: 485 }, () => [
        Math.random() * 640,
        Math.random() * 480,
        20 + Math.random() * 15,
        Math.random() * 360,
      ]),
      descriptors_b64: 'AAEC/w==...[485x32 bytes binary BRIEF patterns]...==',
    },
  };

  const jsonString = JSON.stringify(activePayload, null, 2);
  const payloadBytes = new Blob([jsonString]).size;
  const payloadKb = (payloadBytes / 1024).toFixed(1);

  // Render pitch-black canvas with green ORB keypoint dots and optical flow vector
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Pitch-black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const scaleX = w / (activePayload.scene_features.frame_width || 640);
    const scaleY = h / (activePayload.scene_features.frame_height || 480);

    // 1. Draw green ORB keypoint dots
    ctx.fillStyle = '#10b981';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 4;

    const kps = activePayload.scene_features.keypoints || [];
    for (const kp of kps) {
      const x = kp[0] * scaleX;
      const y = kp[1] * scaleY;
      const r = Math.min(3, Math.max(1.5, (kp[2] || 20) * 0.08));

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // 2. Draw Optical Flow Vector Arrow
    const flow = activePayload.motion_bridge;
    if (flow) {
      const centerX = w / 2;
      const centerY = h / 2;

      let dx = 0;
      let dy = 0;
      if (flow.observed_flow_direction === 'LEFT_IMAGE_COORDS') dx = -70;
      else if (flow.observed_flow_direction === 'RIGHT_IMAGE_COORDS') dx = 70;
      else if (flow.observed_flow_direction === 'UP_IMAGE_COORDS') dy = -70;
      else if (flow.observed_flow_direction === 'DOWN_IMAGE_COORDS') dy = 70;
      else dx = -70;

      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + dx, centerY + dy);
      ctx.stroke();

      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(centerX + dx, centerY + dy, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `Flow: ${flow.observed_flow_direction} (C=${flow.flow_coherence})`,
        centerX,
        centerY + (dy !== 0 ? dy * 1.3 : 30)
      );
    }

    // Watermark tag
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ZERO RAW IMAGES TRANSMITTED - MATHEMATICAL DESCRIPTORS ONLY', 12, h - 12);
  }, [activePayload, viewMode]);

  const handleCopy = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(jsonString).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div className="flex items-center space-x-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 mr-1"
              title="Return to Check-In"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="p-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800/60 flex-shrink-0">
            <Eye className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight">Privacy Inspector</h2>
            <p className="text-[11px] sm:text-xs text-slate-400">
              "What Leaves My Phone?" Visual Proof of Zero Raw Images
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle View Tabs */}
          <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'visual'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Keypoints
            </button>
            <button
              type="button"
              onClick={() => setViewMode('json')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'json'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              JSON ({payloadKb} KB)
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 min-h-[38px]"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 text-center">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider block">Raw Photos Sent</span>
          <p className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-0.5">0.00 KB</p>
          <span className="text-[10px] text-emerald-500 font-medium">100% On-Device</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 text-center">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider block">Payload Size</span>
          <p className="text-xl sm:text-2xl font-bold font-mono text-indigo-400 mt-0.5">{payloadKb} KB</p>
          <span className="text-[10px] text-slate-500">JSON descriptors</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 text-center">
          <span className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider block">Sparse Keypoints</span>
          <p className="text-xl sm:text-2xl font-bold font-mono text-white mt-0.5">
            {activePayload.scene_features.keypoint_count}
          </p>
          <span className="text-[10px] text-slate-500">ORB 256-bit BRIEF</span>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'visual' ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-200">
              Pitch-Black Keypoint Canvas
            </span>
            <span className="text-emerald-400 text-[11px]">
              Only coordinates leave your phone
            </span>
          </div>

          <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-black aspect-[4/3] w-full max-w-full flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="w-full h-full block object-contain"
            />
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            This pitch-black canvas visually demonstrates the non-invertibility of the data transmitted.
            The green dots represent sparse mathematical corner coordinates $(x, y)$, and the cyan vector represents the verified optical flow direction. <strong>No photo of your face, classroom, or peers is ever stored or transmitted.</strong>
          </p>
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">Raw JSON Payload (`POST /api/attendance/submit`)</span>
            <span className="font-mono text-slate-400 text-[11px]">{payloadBytes} bytes</span>
          </div>

          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto max-h-[460px] select-all">
            {jsonString}
          </pre>
        </div>
      )}
    </div>
  );
};

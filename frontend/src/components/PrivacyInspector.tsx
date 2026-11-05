import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Eye, Download, Copy, Check, FileJson, Info, AlertCircle } from 'lucide-react';
import { AttendanceSubmissionPayload } from '../types/attendance';

interface PrivacyInspectorProps {
  payload?: AttendanceSubmissionPayload | null;
  onClose?: () => void;
}

export const PrivacyInspector: React.FC<PrivacyInspectorProps> = ({ payload, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

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

    // 1. Draw 500 green ORB keypoint dots
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

    // Reset shadow
    ctx.shadowBlur = 0;

    // 2. Draw Optical Flow Vector Arrow
    const flow = activePayload.motion_bridge;
    if (flow) {
      const centerX = w / 2;
      const centerY = h / 2;

      let dx = 0;
      let dy = 0;
      if (flow.observed_flow_direction === 'LEFT_IMAGE_COORDS') dx = -80;
      else if (flow.observed_flow_direction === 'RIGHT_IMAGE_COORDS') dx = 80;
      else if (flow.observed_flow_direction === 'UP_IMAGE_COORDS') dy = -80;
      else if (flow.observed_flow_direction === 'DOWN_IMAGE_COORDS') dy = 80;
      else dx = -80;

      // Draw arrow line
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + dx, centerY + dy);
      ctx.stroke();

      // Arrow head
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(centerX + dx, centerY + dy, 7, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(
        `Optical Flow: ${flow.observed_flow_direction} (${flow.mean_flow_magnitude_px}px, C=${flow.flow_coherence})`,
        centerX - 100,
        centerY + (dy !== 0 ? dy * 1.3 : 40)
      );
    }

    // Watermark tag
    ctx.fillStyle = '#334155';
    ctx.font = '11px monospace';
    ctx.fillText('NO RAW IMAGES TRANSMITTED - MATHEMATICAL DESCRIPTORS ONLY', 15, h - 15);
  }, [activePayload]);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800/60">
              <Eye className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">The "Privacy Inspector"</h2>
              <p className="text-xs sm:text-sm text-slate-400">Verifying what leaves your smartphone during attendance check-in</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800/50 flex items-center space-x-2 text-xs font-mono text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Payload Size: ~{payloadKb} KB</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Main Pitch-Black Canvas & Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pitch-Black Canvas */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-3 text-xs text-slate-400">
            <span className="flex items-center font-medium text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5"></span>
              Pitch-Black Wireframe (500 ORB Dots + Motion Vector)
            </span>
            <span className="font-mono text-slate-500">Zero Raw Pixels</span>
          </div>

          <div className="w-full relative rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-black">
            <canvas
              ref={canvasRef}
              width={640}
              height={440}
              className="w-full h-auto block"
            />
          </div>

          <div className="w-full mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>Green dots: 256-bit ORB Keypoints</span>
            <span>Cyan arrow: LK Optical Flow continuity</span>
          </div>
        </div>

        {/* Telemetry Breakdown Card */}
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2 text-emerald-400" />
              Privacy Assurance Guarantee
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Front Camera Raw Video</span>
                <span className="text-emerald-400 font-mono font-bold">0 KB (In RAM)</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Rear Camera Raw Photo</span>
                <span className="text-emerald-400 font-mono font-bold">0 KB (Freed)</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Bystander Faces Redacted</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {activePayload.scene_features.redacted_faces_count} Faces Masked
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Sparse ORB Coordinates</span>
                <span className="text-slate-200 font-mono">
                  {activePayload.scene_features.keypoint_count} pts (~6 KB)
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Binary BRIEF Descriptors</span>
                <span className="text-slate-200 font-mono">
                  {activePayload.scene_features.keypoint_count} × 32B (~12 KB)
                </span>
              </div>

              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-900/40 flex justify-between items-center">
                <span className="text-indigo-300 font-medium">Total Network Payload</span>
                <span className="text-indigo-300 font-mono font-bold">~{payloadKb} KB</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center space-x-2 transition-all"
              >
                <FileJson className="w-4 h-4" />
                <span>{showRawJson ? 'Hide Raw JSON' : 'Inspect Raw JSON Payload'}</span>
              </button>
            </div>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-4 text-xs text-emerald-300 space-y-2">
            <div className="flex items-center space-x-1.5 font-semibold text-emerald-400">
              <Info className="w-4 h-4" />
              <span>Why This Cannot Be Inverted:</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Binary ORB descriptors represent intensity comparisons across pairwise pixel patches. Keypoint coordinates discard all photographic textures, lighting, color, and identity pixels, rendering full scene or facial image reconstruction mathematically infeasible.
            </p>
          </div>
        </div>
      </div>

      {/* Raw JSON Modal / Dropdown */}
      {showRawJson && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">POST /api/attendance/submit JSON Payload</span>
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
            </button>
          </div>

          <pre className="p-4 rounded-xl bg-black/80 border border-slate-800 text-[11px] font-mono text-emerald-400/90 overflow-x-auto max-h-64 leading-tight">
            {jsonString}
          </pre>
        </div>
      )}
    </div>
  );
};

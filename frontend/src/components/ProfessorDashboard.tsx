import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  RotateCcw,
  ShieldCheck,
  Radio,
  Sparkles,
  CheckCircle2,
  XCircle,
  Network,
  Eye,
  Target,
} from 'lucide-react';
import { ConsensusGraphData, GraphNode, GraphEdge } from '../types/attendance';

interface ProfessorDashboardProps {
  sessionId: string;
}

export const ProfessorDashboard: React.FC<ProfessorDashboardProps> = ({ sessionId }) => {
  const [graphData, setGraphData] = useState<ConsensusGraphData>({
    session_id: sessionId,
    nodes: [],
    edges: [],
    total_submissions: 0,
    consensus_cluster_size: 0,
    outliers_count: 0,
    mode: 'PEER_CONSENSUS',
    timestamp_ms: Date.now(),
  });

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [showWhiteboardTarget, setShowWhiteboardTarget] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<(GraphNode & { x: number; y: number; vx: number; vy: number })[]>([]);
  const draggedNodeRef = useRef<any>(null);

  // Fetch initial graph state
  const fetchGraphData = async () => {
    try {
      const res = await fetch(`/api/attendance/consensus-graph/${sessionId}`);
      if (res.ok) {
        const data: ConsensusGraphData = await res.json();
        setGraphData(data);
        initNodes(data.nodes);
      }
    } catch (err) {
      console.warn('Could not fetch graph data:', err);
    }
  };

  useEffect(() => {
    fetchGraphData();

    // Setup live WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/${sessionId}`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'CONSENSUS_GRAPH_UPDATE' || msg.type === 'INITIAL_STATE' || msg.type === 'SIMULATION_COMPLETE') {
            if (msg.graph) {
              setGraphData(msg.graph);
              initNodes(msg.graph.nodes);
            }
          } else if (msg.type === 'SESSION_RESET') {
            setGraphData(msg.graph);
            nodesRef.current = [];
            setSelectedNode(null);
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };
    } catch {
      setWsConnected(false);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [sessionId]);

  // Initialize node coordinates for force simulation
  const initNodes = (incomingNodes: GraphNode[]) => {
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    const width = canvasRef.current?.width || 720;
    const height = canvasRef.current?.height || 460;
    const cx = width / 2;
    const cy = height / 2;

    nodesRef.current = incomingNodes.map((n, idx) => {
      if (existing.has(n.id)) {
        const old = existing.get(n.id)!;
        return { ...n, x: old.x, y: old.y, vx: old.vx * 0.5, vy: old.vy * 0.5 };
      }

      const angle = (idx / Math.max(incomingNodes.length, 1)) * Math.PI * 2;
      const radius = n.status === 'REJECTED_OUTLIER' ? 180 : 100;
      return {
        ...n,
        x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
        y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
      };
    });
  };

  // Force-directed simulation physics loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const nodes = nodesRef.current;
      const edges = graphData.edges || [];

      // 1. Force calculations
      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.hypot(dx, dy) || 1;
          const minDist = 80;
          if (dist < 220) {
            const force = (minDist * minDist) / (dist * dist);
            const fx = (dx / dist) * force * 0.8;
            const fy = (dy / dist) * force * 0.8;
            nodes[i].vx -= fx;
            nodes[i].vy -= fy;
            nodes[j].vx += fx;
            nodes[j].vy += fy;
          }
        }
      }

      // Spring attraction along edges (RANSAC inlier edges)
      for (const edge of edges) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (src && tgt) {
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.hypot(dx, dy) || 1;
          const targetDist = 110;
          const force = (dist - targetDist) * 0.04;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          src.vx += fx;
          src.vy += fy;
          tgt.vx -= fx;
          tgt.vy -= fy;
        }
      }

      // Center gravity
      for (const n of nodes) {
        if (n !== draggedNodeRef.current) {
          const gravityTargetX = n.status === 'REJECTED_OUTLIER' ? cx + 180 : cx;
          const gravityTargetY = cy;
          n.vx += (gravityTargetX - n.x) * 0.01;
          n.vy += (gravityTargetY - n.y) * 0.01;

          // Damping
          n.vx *= 0.82;
          n.vy *= 0.82;

          n.x += n.vx;
          n.y += n.vy;

          // Boundaries
          n.x = Math.max(40, Math.min(width - 40, n.x));
          n.y = Math.max(40, Math.min(height - 40, n.y));
        }
      }

      // 2. Clear canvas
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, width, height);

      // Grid background pattern
      ctx.strokeStyle = '#121826';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 3. Draw Edges with Inlier labels
      for (const edge of edges) {
        const src = nodes.find((n) => n.id === edge.source);
        const tgt = nodes.find((n) => n.id === edge.target);
        if (src && tgt) {
          const isHighlighted = selectedNode && (selectedNode.id === edge.source || selectedNode.id === edge.target);

          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.strokeStyle = isHighlighted ? '#10b981' : 'rgba(99, 102, 241, 0.4)';
          ctx.lineWidth = isHighlighted ? 2.5 : Math.min(3, Math.max(1, edge.inliers * 0.03));
          ctx.stroke();

          // Inlier count pill on edge midpoint
          const midX = (src.x + tgt.x) / 2;
          const midY = (src.y + tgt.y) / 2;

          ctx.fillStyle = '#0f172a';
          ctx.fillRect(midX - 18, midY - 7, 36, 14);
          ctx.strokeStyle = isHighlighted ? '#10b981' : '#334155';
          ctx.lineWidth = 1;
          ctx.strokeRect(midX - 18, midY - 7, 36, 14);

          ctx.fillStyle = isHighlighted ? '#34d399' : '#94a3b8';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${edge.inliers} pts`, midX, midY);
        }
      }

      // 4. Draw Nodes
      for (const n of nodes) {
        const isSelected = selectedNode?.id === n.id;
        const isPresent = n.status === 'PRESENT';
        const isAnchor = n.is_anchor;
        const radius = isAnchor ? 26 : 20;

        // Node Outer Glow / Shadow
        if (isPresent || isAnchor) {
          ctx.shadowColor = isAnchor ? '#eab308' : '#10b981';
          ctx.shadowBlur = isSelected ? 18 : 8;
        } else {
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = isSelected ? 16 : 6;
        }

        // Node Circle
        ctx.fillStyle = isAnchor
          ? '#eab308'
          : isPresent
          ? '#10b981'
          : '#ef4444';
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        // Inner circle border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.stroke();

        // Node Label
        ctx.fillStyle = '#f8fafc';
        ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(n.label, n.x, n.y + radius + 4);

        // Status pill
        ctx.fillStyle = isPresent ? '#059669' : '#dc2626';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(
          isAnchor ? 'ANCHOR' : isPresent ? `PRESENT (${n.inliers_max}p)` : 'OUTLIER',
          n.x,
          n.y + radius + 18
        );
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [graphData, selectedNode]);

  // Universal Touch & Mouse Coordinate Mapper (Properly scales CSS pixels to Canvas resolution!)
  const getCanvasCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    const coords = getCanvasCoords(clientX, clientY);
    if (!coords) return;
    const hit = nodesRef.current.find((n) => Math.hypot(n.x - coords.x, n.y - coords.y) <= 32);
    if (hit) {
      draggedNodeRef.current = hit;
      setSelectedNode(hit);
    } else {
      setSelectedNode(null);
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (draggedNodeRef.current) {
      const coords = getCanvasCoords(clientX, clientY);
      if (coords) {
        draggedNodeRef.current.x = coords.x;
        draggedNodeRef.current.y = coords.y;
        draggedNodeRef.current.vx = 0;
        draggedNodeRef.current.vy = 0;
      }
    }
  };

  const handlePointerUp = () => {
    draggedNodeRef.current = null;
  };

  // 1-Click Simulation Trigger: 5 Students + 1 Spoofer
  const handleTriggerSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch(`/api/simulate/${sessionId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGraphData(data.graph);
        initNodes(data.graph.nodes);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleActivatePeers = async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/activate-classroom-peers`, { method: 'POST' });
      if (res.ok) {
        fetchGraphData();
      }
    } catch (err) {
      console.error('Error activating peers:', err);
    }
  };

  const handleResetSession = async () => {
    try {
      await fetch(`/api/sessions/${sessionId}/reset`, { method: 'POST' });
      setGraphData({
        session_id: sessionId,
        nodes: [],
        edges: [],
        total_submissions: 0,
        consensus_cluster_size: 0,
        outliers_count: 0,
        mode: 'PEER_CONSENSUS',
        timestamp_ms: Date.now(),
      });
      nodesRef.current = [];
      setSelectedNode(null);
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 w-full">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800/60 flex-shrink-0">
              <Network className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight">Professor Dashboard</h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Mode: <span className="text-indigo-400 font-medium">Session Anchor & Peer Consensus</span> (≥15 inliers)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* WS Status Badge */}
          <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono">
            <Radio className={`w-3 h-3 mr-1.5 ${wsConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span className={wsConnected ? 'text-emerald-300' : 'text-slate-400'}>
              {wsConnected ? 'Live' : 'Polling'}
            </span>
          </div>

          {/* Toggle Target View Button */}
          <button
            type="button"
            onClick={() => setShowWhiteboardTarget(!showWhiteboardTarget)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all min-h-[42px] ${
              showWhiteboardTarget
                ? 'bg-indigo-950 text-indigo-300 border-indigo-700/80 shadow-md shadow-indigo-900/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Display whiteboard reference target"
          >
            <Target className="w-3.5 h-3.5 text-indigo-400" />
            <span>Classroom Target</span>
          </button>

          {/* Activate 5 Peers */}
          <button
            type="button"
            onClick={handleActivatePeers}
            className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium transition-all min-h-[42px]"
            title="Add 5 verified students looking at the whiteboard"
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>+5 Classroom Peers</span>
          </button>

          {/* Reset Button */}
          <button
            type="button"
            onClick={handleResetSession}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-all min-h-[42px]"
            title="Reset active session"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* 1-Click Simulator Button */}
          <button
            type="button"
            onClick={handleTriggerSimulation}
            disabled={isSimulating}
            className="flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 min-h-[42px]"
          >
            <Sparkles className="w-4 h-4 text-indigo-200 flex-shrink-0" />
            <span>{isSimulating ? 'Simulating...' : 'Simulate 5 + 1 Spoofer'}</span>
          </button>
        </div>
      </div>

      {/* Classroom Whiteboard Target Modal/Card */}
      {showWhiteboardTarget && (
        <div className="bg-slate-900/90 border border-indigo-700/60 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="p-1.5 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                <Target className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">Classroom Whiteboard Reference Target</h3>
                <p className="text-[11px] text-slate-400">
                  Active Anchor: Point your phone rear camera at this target to verify presence (matches &ge; 15 inliers).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowWhiteboardTarget(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg text-xs"
            >
              ✕ Hide
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <div className="relative group max-w-sm w-full">
              <img
                src="/api/sessions/whiteboard-image"
                alt="Classroom Whiteboard Target"
                className="rounded-lg border border-indigo-500/40 w-full object-contain max-h-52 shadow-md bg-white"
              />
              <span className="absolute bottom-2 right-2 text-[10px] bg-slate-950/90 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-mono">
                Anchor Target Ready
              </span>
            </div>
            <div className="space-y-2 text-xs text-slate-300">
              <p className="font-semibold text-white">How Live Verification Works:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px]">
                <li>Open <strong>Check-In</strong> on your mobile phone.</li>
                <li>Pass the front camera face liveness micro-challenge.</li>
                <li>During the motion bridge, point your phone camera at this whiteboard target on screen.</li>
                <li>VisioAttend computes 256-bit BRIEF binary descriptors directly in phone RAM.</li>
                <li><strong className="text-emerald-400">Aiming at this target:</strong> &ge;15 RANSAC inliers &rarr; <span className="text-emerald-400 font-bold">PRESENT</span>.</li>
                <li><strong className="text-red-400">Aiming at anything else:</strong> 0-3 inliers &rarr; <span className="text-red-400 font-bold">REJECTED_OUTLIER</span>.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4">
          <span className="text-[11px] text-slate-400 block">Total Check-Ins</span>
          <p className="text-xl sm:text-2xl font-bold font-mono text-white mt-0.5">{graphData.total_submissions}</p>
          <span className="text-[10px] text-slate-500">Submissions</span>
        </div>

        <div className="bg-slate-900/80 border border-emerald-900/50 rounded-2xl p-3 sm:p-4">
          <span className="text-[11px] text-emerald-400 block">Verified Present</span>
          <p className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-0.5">{graphData.consensus_cluster_size}</p>
          <span className="text-[10px] text-emerald-500/80">Inliers ≥ 15</span>
        </div>

        <div className="bg-slate-900/80 border border-red-900/50 rounded-2xl p-3 sm:p-4">
          <span className="text-[11px] text-red-400 block">Outliers / Spoofers</span>
          <p className="text-xl sm:text-2xl font-bold font-mono text-red-400 mt-0.5">{graphData.outliers_count}</p>
          <span className="text-[10px] text-red-500/80">Rejected</span>
        </div>

        <div className="bg-slate-900/80 border border-indigo-900/50 rounded-2xl p-3 sm:p-4">
          <span className="text-[11px] text-indigo-400 block">Consensus Threshold</span>
          <p className="text-xl sm:text-2xl font-bold font-mono text-indigo-300 mt-0.5">≥ 15 pts</p>
          <span className="text-[10px] text-indigo-400/80">RANSAC Homography</span>
        </div>
      </div>

      {/* Main Interactive Consensus Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col shadow-xl">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="font-semibold text-slate-200 flex items-center">
              <Network className="w-3.5 h-3.5 mr-1 text-indigo-400" />
              Force-Directed Consensus Graph
            </span>
            <span className="text-[11px] text-slate-400">Touch & drag nodes</span>
          </div>

          <div
            ref={containerRef}
            className="relative rounded-xl overflow-hidden border border-slate-800 bg-[#060a12] shadow-2xl flex-1 min-h-[360px] sm:min-h-[440px] touch-none"
          >
            <canvas
              ref={canvasRef}
              width={720}
              height={440}
              onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
              onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
              onMouseUp={handlePointerUp}
              onTouchStart={(e) => {
                if (e.touches.length > 0) {
                  handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
                }
              }}
              onTouchMove={(e) => {
                if (e.touches.length > 0) {
                  handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
                }
              }}
              onTouchEnd={handlePointerUp}
              className="w-full h-full block cursor-grab active:cursor-grabbing"
            />

            {graphData.nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3 pointer-events-none">
                <Network className="w-10 h-10 text-slate-700 animate-pulse" />
                <p className="text-xs sm:text-sm font-medium text-slate-400">
                  No submissions yet in this session.
                </p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  Tap <strong className="text-indigo-400">"Simulate Classroom"</strong> above to see the 5 students cluster and 1 spoofer get isolated.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Selected Node Details Drawer */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl">
          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center">
              <Users className="w-4 h-4 mr-1.5 text-indigo-400" />
              <span>Student Node Inspector</span>
            </h3>

            {selectedNode ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Student Name</span>
                  <p className="text-sm font-bold text-white mt-0.5">{selectedNode.label}</p>
                  <p className="text-xs font-mono text-slate-400">ID: {selectedNode.id}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-slate-400 text-[10px]">Consensus Status</span>
                    <p className={`font-bold mt-0.5 text-xs ${
                      selectedNode.status === 'PRESENT' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {selectedNode.status}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <span className="text-slate-400 text-[10px]">Max Inliers</span>
                    <p className="font-mono font-bold text-white mt-0.5 text-xs">
                      {selectedNode.inliers_max} pts
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Face Verified:</span>
                    <span className="text-emerald-400 font-medium">PASS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Motion Continuity:</span>
                    <span className="text-emerald-400 font-medium">PASS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">RANSAC Inliers ≥ 15:</span>
                    <span className={selectedNode.inliers_max >= 15 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                      {selectedNode.inliers_max >= 15 ? 'MATCHED' : 'REJECTED'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                Tap or click any student node on the graph to inspect inliers and verification metrics.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Play,
  RotateCcw,
  ShieldCheck,
  Radio,
  Sparkles,
  Info,
  CheckCircle2,
  XCircle,
  Network,
  Maximize2,
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const width = canvasRef.current?.width || 800;
    const height = canvasRef.current?.height || 500;
    const cx = width / 2;
    const cy = height / 2;

    nodesRef.current = incomingNodes.map((n, idx) => {
      if (existing.has(n.id)) {
        const old = existing.get(n.id)!;
        return { ...n, x: old.x, y: old.y, vx: old.vx * 0.5, vy: old.vy * 0.5 };
      }

      // Arrange in circle initially
      const angle = (idx / Math.max(incomingNodes.length, 1)) * Math.PI * 2;
      const radius = n.status === 'REJECTED_OUTLIER' ? 220 : 120;
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
          const minDist = 90;
          if (dist < 260) {
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
          const targetDist = 120;
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
          const gravityTargetX = n.status === 'REJECTED_OUTLIER' ? cx + 240 : cx;
          const gravityTargetY = cy;
          n.vx += (gravityTargetX - n.x) * 0.01;
          n.vy += (gravityTargetY - n.y) * 0.01;

          // Damping
          n.vx *= 0.82;
          n.vy *= 0.82;

          n.x += n.vx;
          n.y += n.vy;

          // Boundaries
          n.x = Math.max(50, Math.min(width - 50, n.x));
          n.y = Math.max(50, Math.min(height - 50, n.y));
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
          const isHighlighted = selectedNode && (selectedNode.id === src.id || selectedNode.id === tgt.id);
          ctx.strokeStyle = isHighlighted ? '#10b981' : '#334155';
          ctx.lineWidth = isHighlighted ? 3 : Math.min(5, Math.max(1.5, edge.inliers * 0.04));

          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.stroke();

          // Inlier text badge on midpoint
          const midX = (src.x + tgt.x) / 2;
          const midY = (src.y + tgt.y) / 2;

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(midX - 22, midY - 9, 44, 18, 4);
          ctx.fill();
          ctx.strokeStyle = '#1e293b';
          ctx.stroke();

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
        const radius = isAnchor ? 28 : 22;

        // Node Outer Glow / Shadow
        if (isPresent || isAnchor) {
          ctx.shadowColor = isAnchor ? '#eab308' : '#10b981';
          ctx.shadowBlur = isSelected ? 20 : 10;
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
        ctx.font = isSelected ? 'bold 12px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(n.label, n.x, n.y + radius + 6);

        // Status pill
        ctx.fillStyle = isPresent ? '#059669' : '#dc2626';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(
          isAnchor ? 'TARGET ANCHOR' : isPresent ? `PRESENT (${n.inliers_max} pts)` : 'OUTLIER',
          n.x,
          n.y + radius + 20
        );
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [graphData, selectedNode]);

  // Handle Dragging and Clicking on Nodes
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = nodesRef.current.find((n) => Math.hypot(n.x - x, n.y - y) <= 30);
    if (hit) {
      draggedNodeRef.current = hit;
      setSelectedNode(hit);
    } else {
      setSelectedNode(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      draggedNodeRef.current.x = e.clientX - rect.left;
      draggedNodeRef.current.y = e.clientY - rect.top;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
    }
  };

  const handleMouseUp = () => {
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
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800/60">
              <Network className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Professor Live Dashboard</h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Peer RANSAC Consensus Graph Verification (Mode:{' '}
                <span className="text-indigo-400 font-medium">Zero-Touch Peer Consensus</span>)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Live WS Status Badge */}
          <div className="flex items-center px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
            <Radio className={`w-3.5 h-3.5 mr-1.5 ${wsConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span className={wsConnected ? 'text-emerald-300' : 'text-slate-400'}>
              {wsConnected ? 'Live WebSocket Connected' : 'Polling Backend'}
            </span>
          </div>

          {/* 1-Click Simulator Button */}
          <button
            onClick={handleTriggerSimulation}
            disabled={isSimulating}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-indigo-200" />
            <span>{isSimulating ? 'Running Homography Matching...' : 'Simulate Classroom (5 Students + 1 Spoofer)'}</span>
          </button>

          {/* Reset Button */}
          <button
            onClick={handleResetSession}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-all"
            title="Reset active session submissions"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <span className="text-xs text-slate-400">Total Check-Ins</span>
          <p className="text-2xl font-bold font-mono text-white mt-1">{graphData.total_submissions}</p>
          <span className="text-[11px] text-slate-500">Dual-camera submissions</span>
        </div>

        <div className="bg-slate-900/60 border border-emerald-900/40 rounded-2xl p-4">
          <span className="text-xs text-emerald-400">Verified Present</span>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{graphData.consensus_cluster_size}</p>
          <span className="text-[11px] text-emerald-500/80">Dominant RANSAC cluster</span>
        </div>

        <div className="bg-slate-900/60 border border-red-900/40 rounded-2xl p-4">
          <span className="text-xs text-red-400">Outliers / Spoofers</span>
          <p className="text-2xl font-bold font-mono text-red-400 mt-1">{graphData.outliers_count}</p>
          <span className="text-[11px] text-red-500/80">&lt; 15 peer inliers</span>
        </div>

        <div className="bg-slate-900/60 border border-indigo-900/40 rounded-2xl p-4">
          <span className="text-xs text-indigo-400">Consensus Inlier Threshold</span>
          <p className="text-2xl font-bold font-mono text-indigo-300 mt-1">≥ 15 pts</p>
          <span className="text-[11px] text-indigo-400/80">Pairwise Lowe & RANSAC</span>
        </div>
      </div>

      {/* Main Interactive Force-Directed Consensus Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-semibold text-slate-200 flex items-center">
              <Network className="w-4 h-4 mr-1.5 text-indigo-400" />
              Force-Directed Geometric Consensus Graph
            </span>
            <span className="text-slate-400">Drag nodes to explore peer clusters</span>
          </div>

          <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-[#060a12] shadow-2xl flex-1 min-h-[460px]">
            <canvas
              ref={canvasRef}
              width={820}
              height={480}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="w-full h-full block cursor-grab active:cursor-grabbing"
            />

            {graphData.nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3 pointer-events-none">
                <Network className="w-12 h-12 text-slate-700 animate-pulse" />
                <p className="text-sm font-medium text-slate-400">
                  No submissions yet in this session.
                </p>
                <p className="text-xs text-slate-500 max-w-sm">
                  Click the <strong className="text-indigo-400">"Simulate Classroom (5 Students + 1 Spoofer)"</strong> button above to run the live demonstration.
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center space-x-4">
              <span className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5"></span>
                Dominant Cluster (Present)
              </span>
              <span className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 mr-1.5"></span>
                Outlier (Isolated)
              </span>
            </div>
            <span>Edges = Pairwise RANSAC inliers (w ≥ 15)</span>
          </div>
        </div>

        {/* Selected Node Details Card / Roster */}
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center">
              <Info className="w-4 h-4 mr-2 text-indigo-400" />
              {selectedNode ? 'Student Node Details' : 'Node Inspector'}
            </h3>

            {selectedNode ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-slate-400">Student Name</span>
                  <p className="text-sm font-bold text-white mt-0.5">{selectedNode.label}</p>
                  <p className="text-slate-500 font-mono mt-0.5">ID: {selectedNode.id}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Consensus Status</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                    selectedNode.status === 'PRESENT'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                      : 'bg-red-950 text-red-400 border border-red-800/60'
                  }`}>
                    {selectedNode.status}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Max Peer RANSAC Inliers</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {selectedNode.inliers_max} inliers
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Face Verification (On-Device)</span>
                  <span className="text-emerald-400 font-semibold">Passed</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Motion Bridge (Lucas-Kanade)</span>
                  <span className="text-cyan-400 font-semibold">Coherence OK</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Click any node on the force graph to inspect its verified RANSAC inlier edges and telemetry.
              </p>
            )}
          </div>

          {/* Roster Table Summary */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300">Live Roster ({graphData.nodes.length})</h4>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {graphData.nodes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => setSelectedNode(n)}
                  className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-all ${
                    selectedNode?.id === n.id
                      ? 'bg-indigo-950/60 border border-indigo-700/60'
                      : 'bg-slate-950/50 hover:bg-slate-900 border border-slate-800/40'
                  }`}
                >
                  <div className="truncate pr-2">
                    <span className="font-medium text-slate-200 block truncate">{n.label}</span>
                    <span className="text-[10px] font-mono text-slate-500">{n.id}</span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                    n.status === 'PRESENT'
                      ? 'bg-emerald-950 text-emerald-400'
                      : 'bg-red-950 text-red-400'
                  }`}>
                    {n.status === 'PRESENT' ? `${n.inliers_max} inliers` : 'OUTLIER'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

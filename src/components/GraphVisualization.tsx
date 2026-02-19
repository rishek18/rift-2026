import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Transaction, AccountNode, FraudRing } from '../types';
import { cn } from '../lib/utils';

const COLORS = {
  cycle: '#ef4444',
  smurfing: '#f59e0b',
  shell: '#3b82f6',
  default: '#94a3b8'
};

interface GraphProps {
  transactions: Transaction[];
  fraudRings: FraudRing[];
  transactionPatterns: Record<string, "cycle" | "smurfing" | "shell">;
  filter: "all" | "cycle" | "smurfing" | "shell";
  onNodeClick: (node: AccountNode) => void;
}

const GraphVisualization: React.FC<GraphProps> = ({
  transactions,
  fraudRings,
  transactionPatterns,
  filter,
  onNodeClick
}) => {
  const svgRef      = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef  = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);

  const isLargeDataset = transactions.length > 1000;

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || transactions.length === 0) return;

    const width  = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 600;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.05, 8])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // ── Build lookup maps from fraudRings ──────────────────────────────────
    // FIX: derive patternType from ring membership, not from transactionPatterns.
    // transactionPatterns only covers transactions that pass through ring accounts,
    // but the graph edge filter needs EVERY transaction between ring members tagged.
    const accountPatternMap  = new Map<string, "cycle" | "smurfing" | "shell">();
    const accountRingMap     = new Map<string, string>();
    const suspiciousAccounts = new Set<string>();
    const ringMemberSets     = new Map<string, Set<string>>(); // ringId → member set

    fraudRings.forEach(ring => {
      const memberSet = new Set<string>(ring.member_accounts);
      ringMemberSets.set(ring.ring_id, memberSet);
      ring.member_accounts.forEach(acc => {
        suspiciousAccounts.add(acc);
        accountRingMap.set(acc, ring.ring_id);
        // pattern from ring takes priority; don't overwrite with lower-priority ring
        if (!accountPatternMap.has(acc)) {
          accountPatternMap.set(acc, ring.pattern_type);
        }
      });
    });

    // ── Tag every transaction with a pattern type ──────────────────────────
    // A transaction is "suspicious" if BOTH sender AND receiver are in the same ring,
    // OR if either endpoint is a suspicious account (for smurfing fan-in/out edges).
    const txPatternMap = new Map<string, "cycle" | "smurfing" | "shell">();

    transactions.forEach(tx => {
      // Check transactionPatterns map first (server-provided)
      if (transactionPatterns[tx.transaction_id]) {
        txPatternMap.set(tx.transaction_id, transactionPatterns[tx.transaction_id]);
        return;
      }
      // FIX: Fall back to ring membership derivation
      const senderPattern   = accountPatternMap.get(tx.sender_id);
      const receiverPattern = accountPatternMap.get(tx.receiver_id);

      if (senderPattern && receiverPattern) {
        // Both endpoints are suspicious — use sender's pattern (more specific)
        txPatternMap.set(tx.transaction_id, senderPattern);
      } else if (senderPattern) {
        txPatternMap.set(tx.transaction_id, senderPattern);
      } else if (receiverPattern) {
        txPatternMap.set(tx.transaction_id, receiverPattern);
      }
    });

    // ── Node stats ─────────────────────────────────────────────────────────
    const nodeStats = new Map<string, { count: number; volume: number }>();
    transactions.forEach(tx => {
      [tx.sender_id, tx.receiver_id].forEach(id => {
        const s = nodeStats.get(id) || { count: 0, volume: 0 };
        s.count  += 1;
        s.volume += tx.amount;
        nodeStats.set(id, s);
      });
    });

    // ── Build nodes & edges with filter ───────────────────────────────────
    const nodesMap = new Map<string, any>();
    const edges: any[] = [];
    let processedEdges = 0;
    const maxEdges = showAll ? 10000 : 2000;

    const makeNode = (id: string) => ({
      id,
      isSuspicious: suspiciousAccounts.has(id),
      suspicionScore: 0,
      patterns: [],
      ringId: accountRingMap.get(id),
      patternType: accountPatternMap.get(id),
      txCount: nodeStats.get(id)?.count  || 0,
      totalVolume: nodeStats.get(id)?.volume || 0
    });

    transactions.forEach(tx => {
      const pattern     = txPatternMap.get(tx.transaction_id);
      const isSuspicious = !!pattern;

      // Skip non-suspicious edges when filtering OR when large dataset is capped
      if (!isSuspicious && filter !== 'all') return;
      if (isLargeDataset && !isSuspicious && !showAll && processedEdges >= maxEdges) return;

      if (!nodesMap.has(tx.sender_id))   nodesMap.set(tx.sender_id,   makeNode(tx.sender_id));
      if (!nodesMap.has(tx.receiver_id)) nodesMap.set(tx.receiver_id, makeNode(tx.receiver_id));

      edges.push({
        source: tx.sender_id,
        target: tx.receiver_id,
        amount: tx.amount,
        id: tx.transaction_id,
        isSuspicious,
        patternType: pattern
      });
      processedEdges++;
    });

    // Apply pattern filter to already-built nodes/edges
    let filteredNodes = Array.from(nodesMap.values());
    let filteredEdges = edges;

    if (filter !== 'all') {
      filteredEdges = edges.filter(e => e.patternType === filter);
      const activeIds = new Set<string>();
      filteredEdges.forEach(e => {
        activeIds.add(typeof e.source === 'string' ? e.source : e.source.id);
        activeIds.add(typeof e.target === 'string' ? e.target : e.target.id);
      });
      // Also include ring members even if no direct edge was recorded
      fraudRings.forEach(ring => {
        if (filter === 'all' || ring.pattern_type === filter) {
          ring.member_accounts.forEach(acc => activeIds.add(acc));
        }
      });
      filteredNodes = filteredNodes.filter(n => activeIds.has(n.id));

      // Add any ring members that weren't in nodesMap yet
      fraudRings
        .filter(r => r.pattern_type === filter)
        .forEach(ring => {
          ring.member_accounts.forEach(acc => {
            if (!nodesMap.has(acc)) filteredNodes.push(makeNode(acc));
          });
        });
    }

    if (filteredNodes.length === 0) return;

    // ── Force simulation ───────────────────────────────────────────────────
    const simulation = d3.forceSimulation(filteredNodes as any)
      .force('link', d3.forceLink(filteredEdges).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(isLargeDataset ? -120 : -280))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(isLargeDataset ? 20 : 35));

    if (filteredNodes.length > 2000) {
      simulation.stop();
      for (let i = 0; i < 120; i++) simulation.tick();
    }

    // ── Arrowheads ─────────────────────────────────────────────────────────
    const defs = svg.append('defs');
    (['cycle', 'smurfing', 'shell', 'default'] as const).forEach(p => {
      defs.append('marker')
        .attr('id', `arrowhead-${p}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22).attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 8).attr('markerHeight', 8)
        .append('path').attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', COLORS[p]);
    });

    // ── Edges ──────────────────────────────────────────────────────────────
    const link = g.append('g')
      .selectAll('line')
      .data(filteredEdges)
      .join('line')
      .attr('stroke', d => COLORS[d.patternType || 'default'])
      .attr('stroke-opacity', d => d.isSuspicious ? 0.8 : 0.15)
      .attr('stroke-width', d => d.isSuspicious ? 2 : 0.5)
      .attr('stroke-dasharray', d => d.patternType === 'shell' ? '4,2' : 'none')
      .attr('marker-end', d => `url(#arrowhead-${d.patternType || 'default'})`);

    // ── Nodes ──────────────────────────────────────────────────────────────
    const node = g.append('g')
      .selectAll('g')
      .data(filteredNodes)
      .join('g')
      .call(d3.drag<any, any>()
        .on('start', (e) => { if (!e.active) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; })
        .on('drag',  (e) => { e.subject.fx = e.x; e.subject.fy = e.y; })
        .on('end',   (e) => { if (!e.active) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }))
      .on('click', (_e, d: any) => onNodeClick(d))
      .on('mouseover', (event, d: any) => {
        if (!tooltipRef.current) return;
        tooltipRef.current.style.opacity = '1';
        tooltipRef.current.innerHTML = `
          <div class="p-3 bg-slate-900 text-white rounded-lg shadow-xl border border-slate-700 text-xs font-mono min-w-[200px]">
            <div class="flex items-center justify-between mb-2 border-b border-slate-700 pb-1">
              <span class="font-bold text-blue-400">${d.id}</span>
              ${d.isSuspicious ? `<span class="text-red-400 font-bold">SUSPICIOUS</span>` : ''}
            </div>
            <div class="space-y-1">
              <div class="flex justify-between"><span>Transactions:</span><span>${d.txCount}</span></div>
              <div class="flex justify-between"><span>Total Volume:</span><span>$${d.totalVolume.toLocaleString()}</span></div>
              ${d.patternType ? `<div class="mt-2 pt-2 border-t border-slate-700 text-amber-400 uppercase font-bold">Pattern: ${d.patternType}</div>` : ''}
              ${d.ringId ? `<div class="text-slate-400">Ring: ${d.ringId}</div>` : ''}
            </div>
          </div>`;
      })
      .on('mousemove', (event) => {
        if (!tooltipRef.current) return;
        tooltipRef.current.style.left = (event.pageX + 15) + 'px';
        tooltipRef.current.style.top  = (event.pageY - 15) + 'px';
      })
      .on('mouseout', () => { if (tooltipRef.current) tooltipRef.current.style.opacity = '0'; });

    node.append('circle')
      .attr('r', d => d.isSuspicious ? 14 : 8)
      .attr('fill',   d => d.isSuspicious ? COLORS[d.patternType || 'default'] : '#ffffff')
      .attr('stroke', d => COLORS[d.patternType || 'default'])
      .attr('stroke-width', d => d.isSuspicious ? 3 : 1.5)
      .attr('class', 'transition-all duration-300 cursor-pointer hover:scale-125');

    if (!isLargeDataset || showAll) {
      node.append('text')
        .text(d => d.id.slice(-6))
        .attr('font-size', '9px')
        .attr('dx', 16).attr('dy', 4)
        .attr('fill', '#475569')
        .attr('class', 'pointer-events-none select-none font-bold');
    }

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);
      node.attr('transform', d => `translate(${(d as any).x},${(d as any).y})`);
    });

    return () => simulation.stop();
  }, [transactions, fraudRings, transactionPatterns, filter, showAll, onNodeClick]);

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-50 rounded-xl overflow-hidden border border-slate-200 shadow-inner relative">
      <div ref={tooltipRef} className="fixed pointer-events-none z-[100] opacity-0 transition-opacity duration-200" />

      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <LegendItem color={COLORS.default}   label="Legitimate" />
        <LegendItem color={COLORS.cycle}     label="Cycle Pattern" />
        <LegendItem color={COLORS.smurfing}  label="Smurfing Pattern" />
        <LegendItem color={COLORS.shell}     label="Shell Network" dashed />

        {isLargeDataset && (
          <button
            onClick={() => setShowAll(!showAll)}
            className={cn(
              "mt-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm border",
              showAll
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            {showAll ? "Focus Mode" : "Show Full Graph (May be slow)"}
          </button>
        )}
      </div>

      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};

const LegendItem = ({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) => (
  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-white/90 backdrop-blur px-2 py-1 rounded border border-slate-200 shadow-sm">
    <div
      className={cn("w-3 h-3 rounded-full", dashed && "border-2 border-dashed bg-transparent")}
      style={{ backgroundColor: dashed ? 'transparent' : color, borderColor: color }}
    />
    <span>{label}</span>
  </div>
);

export default GraphVisualization;

// graph.js — D3 force-directed graph for Gas Town visualization

import * as d3 from 'd3';

let svg, g, simulation, zoomBehavior;
let nodeElements, edgeElements, rigElements;
let currentNodes = [];
let currentEdges = [];
let tooltip;
let onNodeClick = () => {};
let onNodeContext = () => {};

const nodeSize = {
  mayor: 48, deacon: 36, overseer: 40, witness: 32,
  refinery: 36, polecat: 24, crew: 24, bead: 8, convoy: 32,
};

// Track previous node IDs for spawn detection.
let previousNodeIds = new Set();

export function init(container, clickHandler, contextHandler) {
  onNodeClick = clickHandler || onNodeClick;
  onNodeContext = contextHandler || onNodeContext;

  svg = d3.select(container);
  const rect = svg.node().getBoundingClientRect();
  svg.attr('width', rect.width).attr('height', rect.height);

  // Arrow markers.
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow-orange')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20).attr('refY', 0)
    .attr('markerWidth', 6).attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#e85d26');

  // Main group for zoom/pan.
  g = svg.append('g');

  // Zoom behavior.
  zoomBehavior = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (event) => g.attr('transform', event.transform));
  svg.call(zoomBehavior);

  // Double-click background to reset zoom.
  svg.on('dblclick.zoom', null); // Remove default d3 zoom dblclick.
  svg.on('dblclick', (event) => {
    if (event.target === svg.node()) {
      svg.transition().duration(500)
        .call(zoomBehavior.transform, d3.zoomIdentity);
    }
  });

  // Layers.
  g.append('g').attr('class', 'rig-layer');
  g.append('g').attr('class', 'edge-layer');
  g.append('g').attr('class', 'particle-layer');
  g.append('g').attr('class', 'node-layer');

  // Tooltip.
  tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('display', 'none');

  // Force simulation.
  simulation = d3.forceSimulation()
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(rect.width / 2, rect.height / 2))
    .force('collision', d3.forceCollide().radius(d => (nodeSize[d.type] || 24) + 10))
    .force('link', d3.forceLink().id(d => d.id).distance(120).strength(0.3))
    .on('tick', ticked);

  // Idle drift: keep simulation warm with tiny random forces.
  d3.timer(() => {
    if (simulation.alpha() < 0.01) {
      currentNodes.forEach(n => {
        if (!n.fx && !n.fy) {
          n.vx += (Math.random() - 0.5) * 0.3;
          n.vy += (Math.random() - 0.5) * 0.3;
        }
      });
      simulation.alpha(0.005).restart();
    }
  });

  // Handle resize.
  window.addEventListener('resize', () => {
    const r = svg.node().getBoundingClientRect();
    svg.attr('width', r.width).attr('height', r.height);
    simulation.force('center', d3.forceCenter(r.width / 2, r.height / 2));
    simulation.alpha(0.1).restart();
  });

  // Close context menu on click elsewhere.
  document.addEventListener('click', () => {
    const menu = document.getElementById('context-menu');
    if (menu) menu.classList.add('hidden');
  });
}

export function update(snapshot) {
  if (!svg) return;

  const nodes = snapshot.nodes || [];
  const edges = snapshot.edges || [];

  // Detect new and removed nodes for animations.
  const newNodeIds = new Set(nodes.map(n => n.id));
  const spawnedIds = new Set();
  const nukedIds = new Set();

  if (previousNodeIds.size > 0) {
    for (const id of newNodeIds) {
      if (!previousNodeIds.has(id)) spawnedIds.add(id);
    }
    for (const id of previousNodeIds) {
      if (!newNodeIds.has(id)) nukedIds.add(id);
    }
  }
  previousNodeIds = newNodeIds;

  // Merge positions from existing nodes.
  const oldMap = {};
  currentNodes.forEach(n => { oldMap[n.id] = n; });
  nodes.forEach(n => {
    if (oldMap[n.id]) {
      n.x = oldMap[n.id].x;
      n.y = oldMap[n.id].y;
      n.vx = oldMap[n.id].vx;
      n.vy = oldMap[n.id].vy;
    }
  });

  currentNodes = nodes;
  currentEdges = edges;

  // Build edge objects referencing node data.
  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });
  const links = edges
    .filter(e => nodeMap[typeof e.source === 'string' ? e.source : e.source?.id])
    .map(e => ({
      ...e,
      source: typeof e.source === 'string' ? e.source : e.source.id,
      target: typeof e.target === 'string' ? e.target : e.target.id,
    }));

  // Detect rigs.
  const rigs = {};
  nodes.forEach(n => {
    if (n.rig) {
      if (!rigs[n.rig]) rigs[n.rig] = [];
      rigs[n.rig].push(n);
    }
  });

  renderRigs(rigs);
  renderEdges(links);
  renderNodes(nodes, spawnedIds);

  // Update simulation.
  simulation.nodes(nodes);
  simulation.force('link').links(links);
  simulation.alpha(0.3).restart();

  // Apply cluster forces for rigs.
  applyClusterForces(rigs);
}

function renderRigs(rigs) {
  const rigLayer = g.select('.rig-layer');
  const rigData = Object.entries(rigs).map(([name, nodes]) => ({ name, nodes }));

  const rigSel = rigLayer.selectAll('.rig-group')
    .data(rigData, d => d.name);

  const rigEnter = rigSel.enter().append('g').attr('class', 'rig-group');
  rigEnter.append('rect').attr('class', 'rig-container');
  rigEnter.append('text').attr('class', 'rig-label');

  // Double-click rig to zoom in.
  rigEnter.on('dblclick', (event, d) => {
    event.stopPropagation();
    zoomToRig(d);
  });

  rigSel.exit().remove();
  rigElements = rigSel.merge(rigEnter);
}

function zoomToRig(rig) {
  if (!rig.nodes.length) return;
  const padding = 80;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rig.nodes.forEach(n => {
    if (n.x !== undefined) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
  });
  if (minX === Infinity) return;

  const svgRect = svg.node().getBoundingClientRect();
  const dx = maxX - minX + padding * 2;
  const dy = maxY - minY + padding * 2;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.min(svgRect.width / dx, svgRect.height / dy, 2.5);
  const tx = svgRect.width / 2 - cx * scale;
  const ty = svgRect.height / 2 - cy * scale;

  svg.transition().duration(500)
    .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function renderEdges(links) {
  const edgeLayer = g.select('.edge-layer');
  const edgeSel = edgeLayer.selectAll('.edge')
    .data(links, d => d.type + ':' + (d.source.id || d.source) + ':' + (d.target.id || d.target));

  const edgeEnter = edgeSel.enter().append('line')
    .attr('class', d => 'edge edge-' + d.type);

  edgeSel.exit().remove();
  edgeElements = edgeSel.merge(edgeEnter);

  // Apply heartbeat animation to monitoring edges.
  edgeElements.filter(d => d.type === 'monitoring').classed('heartbeat', true);
}

function renderNodes(nodes, spawnedIds) {
  const nodeLayer = g.select('.node-layer');
  const nodeSel = nodeLayer.selectAll('.node')
    .data(nodes, d => d.id);

  const nodeEnter = nodeSel.enter().append('g')
    .attr('class', d => 'node node-' + d.type + ' state-' + d.state)
    .call(d3.drag()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded))
    .on('click', (event, d) => {
      event.stopPropagation();
      onNodeClick(d);
    })
    .on('contextmenu', (event, d) => {
      event.preventDefault();
      event.stopPropagation();
      onNodeContext(event, d);
    })
    .on('mouseenter', showTooltip)
    .on('mouseleave', hideTooltip);

  // Draw shape based on type.
  nodeEnter.each(function(d) {
    const el = d3.select(this);
    const size = nodeSize[d.type] || 24;
    switch (d.type) {
      case 'mayor':
      case 'deacon':
        drawHexagon(el, size);
        break;
      case 'overseer':
        drawDiamond(el, size);
        break;
      case 'witness':
      case 'polecat':
        el.append('circle').attr('class', 'shape').attr('r', size / 2);
        break;
      case 'refinery':
      case 'crew':
        el.append('rect').attr('class', 'shape')
          .attr('x', -size / 2).attr('y', -size * 0.4)
          .attr('width', size).attr('height', size * 0.8)
          .attr('rx', 4);
        break;
      case 'bead':
        el.append('circle').attr('class', 'shape').attr('r', size / 2);
        break;
      case 'convoy':
        el.append('rect').attr('class', 'shape')
          .attr('x', -size / 2).attr('y', -7)
          .attr('width', size).attr('height', 14)
          .attr('rx', 7);
        break;
      default:
        el.append('circle').attr('class', 'shape').attr('r', size / 2);
    }

    // Label (skip for beads — too small).
    if (d.type !== 'bead') {
      el.append('text')
        .attr('dy', size / 2 + 14)
        .text(d.label);
    }
  });

  // Spawn animation: fade in with burst ring.
  nodeEnter.filter(d => spawnedIds.has(d.id))
    .style('opacity', 0)
    .transition().duration(600)
    .style('opacity', 1);

  // Spawn burst ring for polecats.
  nodeEnter.filter(d => spawnedIds.has(d.id) && d.type === 'polecat')
    .each(function() {
      d3.select(this).append('circle')
        .attr('class', 'spawn-ring')
        .attr('r', 0)
        .attr('fill', 'none')
        .attr('stroke', '#39ff14')
        .attr('stroke-width', 3)
        .attr('opacity', 0.8)
        .transition().duration(600)
        .attr('r', 30)
        .attr('opacity', 0)
        .attr('stroke-width', 0)
        .remove();
    });

  // Update classes on existing nodes for state changes.
  nodeSel.attr('class', d => 'node node-' + d.type + ' state-' + d.state);

  const merged = nodeSel.merge(nodeEnter);

  // Apply breathing to working polecats and running agents.
  merged.classed('breathing', d =>
    (d.type === 'polecat' && d.state === 'working') ||
    (['witness', 'refinery', 'mayor', 'deacon'].includes(d.type) && d.state === 'running')
  );

  // Apply pulse to hooked beads.
  merged.classed('pulse-yellow', d => d.type === 'bead' && d.state === 'hooked');

  // Nuke animation: dissolve.
  nodeSel.exit()
    .transition().duration(800)
    .style('opacity', 0)
    .attr('transform', d => `translate(${d.x},${d.y}) scale(0.3)`)
    .remove();

  nodeElements = merged;
}

function drawHexagon(el, size) {
  const r = size / 2;
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    points.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  el.append('polygon')
    .attr('class', 'shape')
    .attr('points', points.map(p => p.join(',')).join(' '));
}

function drawDiamond(el, size) {
  const r = size / 2;
  const points = [[0, -r], [r, 0], [0, r], [-r, 0]];
  el.append('polygon')
    .attr('class', 'shape')
    .attr('points', points.map(p => p.join(',')).join(' '));
}

function ticked() {
  if (edgeElements) {
    edgeElements
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
  }

  if (nodeElements) {
    nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);
  }

  if (rigElements) {
    rigElements.each(function(d) {
      const group = d3.select(this);
      const padding = 40;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      d.nodes.forEach(n => {
        if (n.x !== undefined) {
          minX = Math.min(minX, n.x);
          minY = Math.min(minY, n.y);
          maxX = Math.max(maxX, n.x);
          maxY = Math.max(maxY, n.y);
        }
      });
      if (minX === Infinity) return;
      group.select('.rig-container')
        .attr('x', minX - padding)
        .attr('y', minY - padding)
        .attr('width', maxX - minX + padding * 2)
        .attr('height', maxY - minY + padding * 2);
      group.select('.rig-label')
        .attr('x', minX - padding + 8)
        .attr('y', minY - padding + 16)
        .text(d.name);
    });
  }
}

function applyClusterForces(rigs) {
  const svgRect = svg.node().getBoundingClientRect();
  const rigNames = Object.keys(rigs);
  const clusterCenters = {};

  rigNames.forEach((name, i) => {
    const angle = (2 * Math.PI * i) / rigNames.length;
    const cx = svgRect.width / 2 + Math.cos(angle) * Math.min(svgRect.width, svgRect.height) * 0.25;
    const cy = svgRect.height / 2 + Math.sin(angle) * Math.min(svgRect.width, svgRect.height) * 0.25;
    clusterCenters[name] = { x: cx, y: cy };
  });

  simulation.force('cluster', (alpha) => {
    currentNodes.forEach(node => {
      if (node.rig && clusterCenters[node.rig]) {
        const c = clusterCenters[node.rig];
        node.vx += (c.x - node.x) * alpha * 0.15;
        node.vy += (c.y - node.y) * alpha * 0.15;
      }
    });
  });
}

function showTooltip(event, d) {
  const stateColors = {
    working: '#4a8db7', idle: '#444455', running: '#39ff14',
    nuked: '#2a2a3e', spawning: '#39ff14', stopped: '#ff3344',
    unassigned: '#444455', hooked: '#f0c040', in_progress: '#4a8db7',
    in_refinery: '#e85d26', merged: '#39ff14', closed: '#39ff14',
    rejected: '#ff3344', escalated: '#cc44ff',
  };
  const stateColor = stateColors[d.state] || '#8888a0';

  tooltip
    .style('display', 'block')
    .style('left', (event.pageX + 12) + 'px')
    .style('top', (event.pageY - 8) + 'px')
    .html(`
      <div class="tt-label">${d.label}</div>
      <div class="tt-type">${d.type}${d.rig ? ' \u00B7 ' + d.rig : ''}</div>
      <div class="tt-state" style="color: ${stateColor}">${d.state}</div>
      ${d.metadata?.hooked_bead ? `<div class="tt-type">hook: ${d.metadata.hooked_bead}</div>` : ''}
      ${d.metadata?.title ? `<div class="tt-type">${d.metadata.title}</div>` : ''}
    `);

  // Highlight connected edges.
  if (edgeElements) {
    edgeElements.style('opacity', e => {
      const sid = e.source.id || e.source;
      const tid = e.target.id || e.target;
      return (sid === d.id || tid === d.id) ? 1 : 0.15;
    });
  }
}

function hideTooltip() {
  tooltip.style('display', 'none');
  if (edgeElements) {
    edgeElements.style('opacity', null);
  }
}

function dragStarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragEnded(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

// Animate a mail particle along an edge path.
export function animateMailParticle(sourceId, targetId) {
  const layer = g.select('.particle-layer');
  const sourceNode = currentNodes.find(n => n.id === sourceId);
  const targetNode = currentNodes.find(n => n.id === targetId);
  if (!sourceNode || !targetNode) return;

  const particle = layer.append('circle')
    .attr('r', 4)
    .attr('fill', '#e0e0e8')
    .attr('opacity', 0.9)
    .attr('cx', sourceNode.x)
    .attr('cy', sourceNode.y);

  particle.transition()
    .duration(800)
    .attr('cx', targetNode.x)
    .attr('cy', targetNode.y)
    .attr('opacity', 0)
    .remove();
}

// Animate a green merge pulse on a refinery node.
export function animateMergePulse(refineryId) {
  const node = currentNodes.find(n => n.id === refineryId);
  if (!node) return;

  const layer = g.select('.particle-layer');
  layer.append('circle')
    .attr('cx', node.x)
    .attr('cy', node.y)
    .attr('r', 18)
    .attr('fill', 'none')
    .attr('stroke', '#39ff14')
    .attr('stroke-width', 3)
    .attr('opacity', 0.8)
    .transition().duration(500)
    .attr('r', 60)
    .attr('opacity', 0)
    .attr('stroke-width', 0)
    .remove();
}

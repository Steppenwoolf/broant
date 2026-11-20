// Smart DOM Pruning for reducing token footprint on smaller local models (1.7B-8B).
// Strips non-interactive decorative SVG/canvas, collapses transparent wrappers,
// folds repeated rows (>25 items), and truncates verbose text.

import type { ONode } from './outline';

export type PruningMode = 'standard' | 'compact';

export interface PruningConfig {
  mode: PruningMode;
  dropDecorativeGraphics: boolean;
  collapseGenericWrappers: boolean;
  stripNoiseAttributes: boolean;
  maxTextLenPerNode: number;
  maxRepeatedSiblings: number;
  maxTotalChars: number;
}

export const PRUNING_PRESETS: Record<PruningMode, PruningConfig> = {
  standard: {
    mode: 'standard',
    dropDecorativeGraphics: false,
    collapseGenericWrappers: false,
    stripNoiseAttributes: false,
    maxTextLenPerNode: 500,
    maxRepeatedSiblings: Infinity,
    maxTotalChars: Infinity,
  },
  compact: {
    mode: 'compact',
    dropDecorativeGraphics: true,
    collapseGenericWrappers: true,
    stripNoiseAttributes: true,
    maxTextLenPerNode: 160,
    maxRepeatedSiblings: 25,
    maxTotalChars: 14_000,
  },
};

const WRAPPER_ROLES = new Set(['generic', 'none', 'presentation', 'group', 'div', 'span', 'region', 'section']);
const GRAPHIC_ROLES = new Set(['img', 'image', 'svg', 'graphics-document', 'canvas', 'figure']);

export function pruneOutlineNode(node: ONode, cfg: PruningConfig): ONode[] {
  if (cfg.mode !== 'compact') return [node];

  const isInteractive = Boolean(node.ref) || node.actionable;
  const cleanName = node.name?.trim() ?? '';

  // 1. Drop decorative graphics without interactivity and without meaningful name
  if (cfg.dropDecorativeGraphics && !isInteractive && GRAPHIC_ROLES.has(node.role) && cleanName.length < 3) {
    return [];
  }

  // 2. Process children recursively
  let children: ONode[] = [];
  if (node.children?.length) {
    for (const child of node.children) {
      children.push(...pruneOutlineNode(child, cfg));
    }
  }

  // 3. Fold excessive repeated siblings in huge lists or tables
  if (Number.isFinite(cfg.maxRepeatedSiblings) && children.length > cfg.maxRepeatedSiblings) {
    const omitted = children.length - cfg.maxRepeatedSiblings;
    children = children.slice(0, cfg.maxRepeatedSiblings);
    children.push({
      kind: 'element',
      rawRole: 'note',
      role: 'note',
      name: `[... ${omitted} more items omitted; scroll or use text tool]`,
      states: [],
      actionable: false,
      frameId: node.frameId,
      sessionId: node.sessionId,
      loaderId: node.loaderId,
      children: [],
    });
  }

  // 4. Collapse empty / generic transit wrappers
  if (cfg.collapseGenericWrappers && !isInteractive && !cleanName && (!node.value || !node.value.trim()) && WRAPPER_ROLES.has(node.role)) {
    if (children.length === 0) return [];
    if (children.length === 1) return children;
  }

  // 5. Trim long text names/values in compact overview
  let trimmedName = node.name;
  if (cleanName.length > cfg.maxTextLenPerNode) {
    trimmedName = `${cleanName.slice(0, cfg.maxTextLenPerNode)}…`;
  }

  let trimmedValue = node.value;
  if (node.value && node.value.length > cfg.maxTextLenPerNode) {
    trimmedValue = `${node.value.slice(0, cfg.maxTextLenPerNode)}…`;
  }

  return [{ ...node, name: trimmedName, value: trimmedValue, children }];
}

export function pruneOutlineTree(roots: ONode[], cfg: PruningConfig): ONode[] {
  if (cfg.mode !== 'compact') return roots;
  const result: ONode[] = [];
  for (const root of roots) {
    result.push(...pruneOutlineNode(root, cfg));
  }
  return result;
}

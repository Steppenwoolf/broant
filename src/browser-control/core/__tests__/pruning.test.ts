import { describe, expect, it } from 'vitest';
import { PRUNING_PRESETS, pruneOutlineNode, pruneOutlineTree } from '../perception/pruning';
import type { ONode } from '../perception/outline';

function makeNode(overrides: Partial<ONode> = {}): ONode {
  return {
    kind: 'element',
    rawRole: overrides.role ?? 'generic',
    role: overrides.role ?? 'generic',
    name: overrides.name ?? '',
    states: [],
    actionable: Boolean(overrides.ref),
    frameId: 'f1',
    sessionId: 's1',
    loaderId: 'l1',
    children: [],
    ...overrides,
  };
}

describe('Smart DOM Pruning', () => {
  it('keeps standard trees unchanged when standard preset is used', () => {
    const tree = [
      makeNode({
        role: 'svg',
        name: '',
        children: [makeNode({ role: 'path' })],
      }),
    ];
    const pruned = pruneOutlineTree(tree, PRUNING_PRESETS.standard);
    expect(pruned).toEqual(tree);
  });

  it('drops decorative graphics without interactivity or meaningful name in compact mode', () => {
    const decorativeSvg = makeNode({ role: 'svg', name: '' });
    const decorativeImg = makeNode({ role: 'img', name: '  ' });
    const interactiveSvg = makeNode({ role: 'svg', name: '', ref: 'e1' });
    const informativeImg = makeNode({ role: 'img', name: 'Company Logo' });

    expect(pruneOutlineNode(decorativeSvg, PRUNING_PRESETS.compact)).toEqual([]);
    expect(pruneOutlineNode(decorativeImg, PRUNING_PRESETS.compact)).toEqual([]);
    expect(pruneOutlineNode(interactiveSvg, PRUNING_PRESETS.compact).length).toBe(1);
    expect(pruneOutlineNode(informativeImg, PRUNING_PRESETS.compact).length).toBe(1);
  });

  it('collapses empty or single-child structural wrappers in compact mode', () => {
    const emptyWrapper = makeNode({ role: 'generic', name: '', children: [] });
    expect(pruneOutlineNode(emptyWrapper, PRUNING_PRESETS.compact)).toEqual([]);

    const button = makeNode({ role: 'button', name: 'Submit', ref: 'e5' });
    const nestedWrapper = makeNode({
      role: 'div',
      name: '',
      children: [
        makeNode({
          role: 'generic',
          name: '',
          children: [button],
        }),
      ],
    });

    const collapsed = pruneOutlineNode(nestedWrapper, PRUNING_PRESETS.compact);
    expect(collapsed.length).toBe(1);
    expect(collapsed[0].role).toBe('button');
    expect(collapsed[0].name).toBe('Submit');
    expect(collapsed[0].ref).toBe('e5');
  });

  it('folds repeated siblings beyond maxRepeatedSiblings into a note', () => {
    const rows: ONode[] = [];
    for (let i = 1; i <= 50; i++) {
      rows.push(makeNode({ role: 'row', name: `Row ${i}`, ref: `r${i}` }));
    }

    const table = makeNode({
      role: 'table',
      name: 'Economic Calendar',
      children: rows,
    });

    const pruned = pruneOutlineNode(table, PRUNING_PRESETS.compact);
    expect(pruned.length).toBe(1);
    const children = pruned[0].children;
    // 25 kept rows + 1 note
    expect(children.length).toBe(26);
    expect(children[24].name).toBe('Row 25');
    expect(children[25].role).toBe('note');
    expect(children[25].name).toContain('25 more items omitted');
  });

  it('truncates verbose node texts in compact mode', () => {
    const longText = 'A'.repeat(300);
    const node = makeNode({ role: 'text', name: longText });

    const pruned = pruneOutlineNode(node, PRUNING_PRESETS.compact);
    expect(pruned[0].name.length).toBe(161); // 160 + '…'
    expect(pruned[0].name.endsWith('…')).toBe(true);
  });
});

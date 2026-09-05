import { useEffect, useRef, useState } from 'react';
import type { TreeNode } from '../api/types';
import { navigate } from '../lib/hashRoute';
import { getPersistedOpen, setPersistedOpen } from '../lib/treeOpenState';

export const NODE_DRAG_MIME = 'application/x-mindview-node-path';

/** A bump of `n` re-applies `open` to every folder row, regardless of
 * depth or whatever the user had toggled manually — that's what "expand
 * all" / "collapse all" means. `n` (not just `open`) is what triggers it,
 * so clicking the same target state twice in a row still re-applies. */
export interface TreeForceState {
  open: boolean;
  n: number;
}

interface TreeProps {
  nodes: TreeNode[];
  activePath: string | null;
  forceState?: TreeForceState;
}

export function Tree({ nodes, activePath, forceState }: TreeProps) {
  return (
    <ul className="tree-list">
      {nodes.map((n) => (
        <TreeRow key={n.path} node={n} activePath={activePath} depth={0} forceState={forceState} />
      ))}
    </ul>
  );
}

function TreeRow({
  node,
  activePath,
  depth,
  forceState,
}: {
  node: TreeNode;
  activePath: string | null;
  depth: number;
  forceState?: TreeForceState;
}) {
  // Persisted across reloads (localStorage, see treeOpenState.ts) — falls
  // back to the depth<1 default the first time a folder is ever seen.
  const [open, setOpenState] = useState(() => getPersistedOpen(node.path, depth < 1));
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setOpenState((prev) => {
      const resolved = typeof next === 'function' ? (next as (prev: boolean) => boolean)(prev) : next;
      setPersistedOpen(node.path, resolved);
      return resolved;
    });
  };
  const appliedSignal = useRef(forceState?.n ?? 0);

  useEffect(() => {
    if (forceState && forceState.n !== appliedSignal.current) {
      appliedSignal.current = forceState.n;
      setOpen(forceState.open);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceState]);

  if (node.type === 'folder') {
    return (
      <li>
        <div className="tree-row folder" onClick={() => setOpen((o) => !o)}>
          <span className={`caret${open ? ' is-open' : ''}`}>▸</span>
          <span>{node.name}</span>
        </div>
        {/* Children always mount (this is what makes "expand all" reach
         * every depth even when nothing was ever opened by hand) — a
         * closed folder just clips them to zero height via the grid-rows
         * trick below, which is also what makes the open/close smooth
         * instead of an instant mount/unmount. */}
        {node.children && (
          <div className={`tree-collapse${open ? ' is-open' : ''}`}>
            <ul className="tree-list tree-collapse-inner">
              {node.children.map((c) => (
                <TreeRow key={c.path} node={c} activePath={activePath} depth={depth + 1} forceState={forceState} />
              ))}
            </ul>
          </div>
        )}
      </li>
    );
  }

  const isDraggableNode = node.kind === 'mind-node';
  return (
    <li>
      <div
        className={`tree-row${node.path === activePath ? ' is-active' : ''}`}
        onClick={() => navigate('read', node.path)}
        draggable={isDraggableNode}
        onDragStart={(e) => {
          if (!isDraggableNode) return;
          e.dataTransfer.setData(NODE_DRAG_MIME, node.path);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        title={node.path}
      >
        <span className="caret" />
        <span className={`kind-dot ${node.kind ?? ''}`} />
        <span>{node.name}</span>
      </div>
    </li>
  );
}

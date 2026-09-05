import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApi } from '../hooks/useApi';
import type { TreeNode } from '../api/types';

function flatten(nodes: TreeNode[], into: Set<string>): void {
  for (const n of nodes) {
    if (n.type === 'file') into.add(n.path);
    else if (n.children) flatten(n.children, into);
  }
}

interface TreeContextValue {
  tree: TreeNode[] | null;
  /** every known file path — lets MarkdownBody tell a broken internal link
   * apart from a valid one without a second round-trip per link. */
  pathSet: Set<string>;
}

const TreeContext = createContext<TreeContextValue>({ tree: null, pathSet: new Set() });

export function TreeProvider({ children }: { children: ReactNode }) {
  const { data: tree } = useApi<TreeNode[]>('/tree');
  const pathSet = useMemo(() => {
    const set = new Set<string>();
    if (tree) flatten(tree, set);
    return set;
  }, [tree]);
  return <TreeContext.Provider value={{ tree, pathSet }}>{children}</TreeContext.Provider>;
}

export function useTree(): TreeContextValue {
  return useContext(TreeContext);
}

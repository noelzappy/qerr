// Which rows of a list are ticked. Selecting is by id; ids that leave the list (a filter changed, an item was deleted)
// drop out of the selection, so a bulk action never reaches something the person cannot see.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// The ids from `from` to `to` inclusive, in list order (either direction). Empty when either is not in the list.
function idsBetween(ids: readonly string[], from: string, to: string): string[] {
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0) return [];
  return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
}

export interface Selection {
  selected: ReadonlySet<string>;
  // Selected ids in the order they are listed.
  ids: string[];
  count: number;
  allSelected: boolean;
  isSelected: (id: string) => boolean;
  // `range` (shift-click) ticks or unticks everything between the last row clicked and this one.
  toggle: (id: string, range?: boolean) => void;
  toggleAll: () => void;
  selectAll: () => void;
  // Ticks these ids as well as the ones already ticked.
  selectMany: (ids: readonly string[]) => void;
  clear: () => void;
  // Unticks the ids that were dealt with, leaving the ones that failed ticked.
  deselect: (ids: readonly string[]) => void;
}

export function useSelection(visibleIds: readonly string[]): Selection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const visibleKey = visibleIds.join('\n');

  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelected((cur) => {
      const next = new Set([...cur].filter((id) => visible.has(id)));
      return next.size === cur.size ? cur : next;
    });
    // visibleKey stands for visibleIds: the array is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  const toggle = useCallback((id: string, range = false) => {
    setSelected((cur) => {
      const on = !cur.has(id);
      const targets = range && anchor.current ? idsBetween(visibleIds, anchor.current, id) : [];
      const next = new Set(cur);
      for (const t of targets.length ? targets : [id]) { if (on) next.add(t); else next.delete(t); }
      return next;
    });
    anchor.current = id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectAll = useCallback(() => setSelected(new Set(visibleIds)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleKey]);
  const selectMany = useCallback((ids: readonly string[]) => setSelected((cur) => new Set([...cur, ...ids])), []);
  const clear = useCallback(() => { setSelected(new Set()); anchor.current = null; }, []);
  const deselect = useCallback((ids: readonly string[]) => setSelected((cur) => {
    const gone = new Set(ids);
    return new Set([...cur].filter((id) => !gone.has(id)));
  }), []);

  return useMemo(() => ({
    selected,
    ids: visibleIds.filter((id) => selected.has(id)),
    count: selected.size,
    allSelected,
    isSelected: (id: string) => selected.has(id),
    toggle,
    toggleAll: () => (allSelected ? clear() : selectAll()),
    selectAll,
    selectMany,
    clear,
    deselect,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [selected, allSelected, toggle, selectAll, selectMany, clear, deselect, visibleKey]);
}

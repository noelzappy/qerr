// The bulk actions for vault items, shared by the Library grid and the Vault list: Confirm, Unconfirm, Add tag, Delete.
// Each one calls the same endpoint as the single-item action, once per item.
import { useState } from 'react';
import { CheckCheck, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { BulkBar } from '@/components/bulk-bar';
import { useBulkRun } from '@/components/use-bulk-run';
import type { Selection } from '@/components/use-selection';
import { Button } from '@/components/ui/button';
import { mergeTags, runBulk, succeededIds } from '@/lib/bulk';
import { errorMessage } from '@/lib/errors';
import type { VaultItem } from '../vault-types';
import { BulkTagPopover } from './bulk-tag-popover';
import { ConfirmAction } from './confirm-action';

export function VaultBulkBar({ selection, items, noun, reload }: {
  selection: Selection;
  // The items on the page, to know each one's status and tags.
  items: readonly VaultItem[];
  // "picture" or "item": used in "Delete 7 pictures?".
  noun: string;
  reload: () => Promise<unknown> | unknown;
}) {
  const { busy, run } = useBulkRun(selection, reload);
  // The ids the person agreed to delete, fixed when the dialog opened (the selection shrinks as items are deleted).
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const picked = items.filter((i) => selection.isSelected(i.id));
  const toConfirm = picked.filter((i) => i.status !== 'confirmed');
  const toUnconfirm = picked.filter((i) => i.status === 'confirmed');
  const plural = (n: number) => `${n} ${n === 1 ? noun : `${noun}s`}`;
  const none = (what: string) => toast.info(`Every selected ${noun} is already ${what}`);

  const confirm = () => (toConfirm.length ? run(toConfirm.map((i) => i.id), 'confirmed', (id) => api.post(`/api/vault/${id}/confirm`)) : none('confirmed'));
  const unconfirm = () => (toUnconfirm.length ? run(toUnconfirm.map((i) => i.id), 'unconfirmed', (id) => api.post(`/api/vault/${id}/unconfirm`)) : none('unconfirmed'));
  const addTags = (tags: string[]) => run(selection.ids, 'tagged', (id) => {
    const existing = items.find((i) => i.id === id)?.tags ?? [];
    return api.patch(`/api/vault/${id}`, { tags: mergeTags(existing, tags) });
  });

  async function remove() {
    const results = await run(deleting ?? [], 'deleted', (id) => api.delete(`/api/vault/${id}`));
    setDeleting(null);
    const gone = succeededIds(results);
    if (gone.length) {
      toast(`Deleted ${plural(gone.length)}`, {
        duration: 9000,
        action: {
          label: 'Undo',
          onClick: () => {
            void runBulk(gone, (id) => api.post(`/api/vault/${id}/restore`)).then(async (r) => {
              const failed = r.length - succeededIds(r).length;
              if (failed) toast.error(`${failed} could not be restored`); else toast.success(`${plural(r.length)} restored`);
              await reload();
            }).catch((e: unknown) => toast.error(errorMessage(e)));
          },
        },
      });
    }
  }

  return (
    <>
      <BulkBar count={selection.count} busy={busy} onClear={selection.clear}>
        <Button className="max-sm:min-h-11" disabled={busy} onClick={() => void confirm()}><CheckCheck aria-hidden="true" />Confirm</Button>
        <Button variant="outline" className="max-sm:min-h-11" disabled={busy} onClick={() => void unconfirm()}><RotateCcw aria-hidden="true" />Unconfirm</Button>
        <BulkTagPopover count={selection.count} disabled={busy} onAdd={addTags} />
        <Button variant="outline" className="text-destructive hover:text-destructive max-sm:min-h-11" disabled={busy} onClick={() => setDeleting(selection.ids)}><Trash2 aria-hidden="true" />Delete</Button>
      </BulkBar>
      <ConfirmAction
        open={deleting !== null}
        destructive
        title={`Delete ${plural(deleting?.length ?? 0)}?`}
        message={<>{deleting?.length === 1 ? 'This item' : 'These items'} will leave the vault and stop being used for posts. Posts that rely on {deleting?.length === 1 ? 'it' : 'them'} lose their approval. You can undo this right after.</>}
        confirmLabel={`Delete ${plural(deleting?.length ?? 0)}`}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

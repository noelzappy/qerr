// The bulk actions for vault items, shared by the Pictures grid and the Facts list: Confirm, Unconfirm, Add tag, Rights (licence,
// people and consent, for pictures), Delete.
// Each one calls the same endpoint as the single-item action, once per item.
import { useState } from 'react';
import { CheckCheck, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api';
import { BulkBar, BulkTagPopover, ConfirmAction, useBulkRun, type Selection } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { mergeTags, runBulk, succeededIds } from '@/lib/bulk';
import { errorMessage } from '@/lib/errors';
import type { VaultItem } from '../vault-types';
import { BulkRightsPopover } from './BulkRightsPopover';
import { rightsPatch, type RightsChoice } from './bulk-rights';

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

  // Only the pictures whose rights would change are sent; the others are named in one message.
  async function setRights(choice: RightsChoice) {
    const changes = picked.map((i) => ({ id: i.id, patch: rightsPatch(i, choice) })).filter((c) => c.patch);
    const pictures = picked.filter((i) => i.kind === 'photo' || i.kind === 'screen').length;
    if (!pictures) { toast.info('Rights and consent are recorded on pictures only; none of the selected items is a picture'); return; }
    if (!changes.length) { toast.info(`The selected pictures already have these rights`); return; }
    const patches = new Map(changes.map((c) => [c.id, c.patch]));
    await run([...patches.keys()], 'updated', (id) => api.patch(`/api/vault/${id}`, patches.get(id)));
    if (picked.length > pictures) toast.info(`${picked.length - pictures} selected ${picked.length - pictures === 1 ? 'item is not a picture' : 'items are not pictures'}, so ${picked.length - pictures === 1 ? 'it was' : 'they were'} left as ${picked.length - pictures === 1 ? 'it was' : 'they were'}`);
  }

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
        <BulkRightsPopover count={selection.count} disabled={busy} onApply={setRights} />
        <Button variant="outline" className="text-destructive hover:text-destructive max-sm:min-h-11" disabled={busy} onClick={() => setDeleting(selection.ids)}><Trash2 aria-hidden="true" />Delete</Button>
      </BulkBar>
      <ConfirmAction
        open={deleting !== null}
        danger
        title={`Delete ${plural(deleting?.length ?? 0)}?`}
        message={<>{deleting?.length === 1 ? 'This item' : 'These items'} will leave your saved facts and pictures and stop being used for posts. Posts that rely on {deleting?.length === 1 ? 'it' : 'them'} lose their approval. You can undo this right after.</>}
        confirmLabel={`Delete ${plural(deleting?.length ?? 0)}`}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

// "Picture focus": the chosen picture with the part each post size keeps drawn on it. A click or a drag sets the point that stays in view;
// once the picture has focus, the wheel or a pinch zooms, and the small slider under it does the same. Arrow keys move the point (Shift
// for bigger steps), + and - zoom, Home puts the point in the middle. What is stored is unchanged: focal "N% N%" and zoom 1 to 3.
// A focus point the form cannot show (one set per size) is left as it is and named as something for Advanced.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ImageOff } from 'lucide-react';
import { Hint } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { cropFrame, focalString, nudge, pinchZoom, pointToFocal, POST_SIZES, wheelSteps, ZOOM, zoomBy, type Pt } from './focal-frame';
import { focalXY } from './image-options-support';
import { useCurrentPicture } from './PicturePicker';

const isPerSize = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && !('x' in (v as Record<string, unknown>));
const zoomOf = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function PictureFocus({ focal, zoom, onChange, vaultItemId, sizes = ['feed'], withFocal = true, withZoom = true, disabled }: {
  focal: unknown;
  zoom: unknown;
  // both values every time (one change of the design, never two that race): undefined leaves it to the layout
  onChange: (focal: string | undefined, zoom: number | undefined) => void;
  // the picture shown: a picture from the Pictures page (a file path of the engine's own is shown as a plain box)
  vaultItemId?: string;
  sizes?: string[];
  withFocal?: boolean;
  withZoom?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const picture = useCurrentPicture(vaultItemId);
  const src = picture.state === 'ready' ? picture.url : null;
  const [aspect, setAspect] = useState<number | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setAspect(null); setBroken(false); }, [src]);
  const area = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number | undefined } | null>(null);
  const gathered = useRef(0);
  // the focus as it is stored, kept as written when only the zoom changes
  const keptFocal = typeof focal === 'string' ? focal : focalXY(focal) ? focalString(focalXY(focal)!) : undefined;
  const onFocal = (v: string | undefined) => onChange(v, zoomOf(zoom));
  const onZoom = (v: number | undefined) => onChange(keptFocal, v);
  const live = useRef({ zoom, onZoom, disabled });
  live.current = { zoom, onZoom, disabled };

  const xy = focalXY(focal);
  const set = focal !== undefined;
  const p: Pt = xy ?? { x: 50, y: 50 };
  const z = zoomOf(zoom) ?? 1;
  const odd = set && !xy;

  // the wheel zooms only while the picture has focus, so scrolling the page past it still scrolls the page
  useEffect(() => {
    const el = area.current;
    if (!el || !withZoom) return;
    const onWheel = (e: WheelEvent) => {
      if (live.current.disabled || document.activeElement !== el) return;
      e.preventDefault();
      gathered.current += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      const { steps, rest } = wheelSteps(gathered.current);
      gathered.current = rest;
      if (steps) live.current.onZoom(zoomBy(zoomOf(live.current.zoom), steps));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [withZoom, odd]);

  if (odd) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[13px] font-medium">Picture focus</span>
        <p className="text-[13px] text-muted-foreground">{isPerSize(focal) ? 'This focus is set for each size separately.' : 'This focus is written in a way this form does not show.'} Change it in Advanced, or <button type="button" className="underline underline-offset-2" disabled={disabled} onClick={() => onFocal(undefined)}>clear it</button>.</p>
      </div>
    );
  }

  const at = (e: { clientX: number; clientY: number }) => {
    const img = area.current?.querySelector('[data-picture]') as HTMLElement | null;
    return pointToFocal(e.clientX, e.clientY, (img ?? area.current!).getBoundingClientRect());
  };
  function down(e: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    area.current?.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2 && withZoom) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: zoomOf(zoom) };
      return;
    }
    if (withFocal && pointers.current.size === 1) onFocal(focalString(at(e)));
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || disabled) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      onZoom(pinchZoom(pinch.current.zoom, pinch.current.distance, Math.hypot(a!.x - b!.x, a!.y - b!.y)));
      return;
    }
    if (withFocal && pointers.current.size === 1 && !pinch.current) onFocal(focalString(at(e)));
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (withZoom && (e.key === '+' || e.key === '=' || e.key === '-')) { e.preventDefault(); onZoom(zoomBy(zoomOf(zoom), e.key === '-' ? -1 : 1)); return; }
    if (!withFocal) return;
    const next = nudge(p, e.key, e.shiftKey);
    if (next) { e.preventDefault(); onFocal(focalString(next)); }
  }

  const ratio = aspect ?? 1;
  const frames = sizes.filter((s) => s in POST_SIZES).map((s, i) => ({ size: s, i, box: cropFrame(ratio, POST_SIZES[s]!.w / POST_SIZES[s]!.h, p, z) }));
  const status = `${withFocal ? `Focus ${Math.round(p.x)}% across, ${Math.round(p.y)}% down${set ? '' : ' (the layout\'s)'}` : ''}${withFocal && withZoom ? ' · ' : ''}${withZoom ? `zoom ${z.toFixed(1)}×` : ''}`;
  const how = [withFocal && 'Click or drag on the picture to set the point that stays in view.', withZoom && 'Once it has focus, scroll or pinch to zoom.', 'Arrow keys move the point; + and - zoom.']
    .filter(Boolean).join(' ');
  const showPicture = src && !broken;

  return (
    <div className="flex min-w-0 flex-col gap-2" role="group" aria-labelledby={`${id}-l`}>
      <span className="flex items-center gap-1">
        <span id={`${id}-l`} className="text-[13px] font-medium">Picture focus</span>
        <Hint about="Picture focus" id={`${id}-how`}>{how} The frames show what each post size keeps; a design may place the picture in a smaller window.</Hint>
      </span>
      <div
        ref={area}
        tabIndex={disabled ? -1 : 0}
        role="application"
        aria-roledescription="picture focus"
        aria-label={`Picture focus. ${status}`}
        aria-describedby={`${id}-how`}
        aria-disabled={disabled ? true : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        className={cn(
          'relative w-full max-w-[28rem] touch-none select-none overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair',
        )}
      >
        <div data-picture className="relative mx-auto" style={{ aspectRatio: String(ratio), width: `min(100%, calc(18rem * ${ratio.toFixed(4)}))` }}>
          {showPicture ? (
            <img src={src} alt="" draggable={false} className="block size-full object-fill" onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight); }} onError={() => setBroken(true)} />
          ) : (
            <div className="flex size-full min-h-40 flex-col items-center justify-center gap-1 text-[12.5px] text-muted-foreground">
              <ImageOff className="size-5" aria-hidden="true" />
              {picture.state === 'loading' ? 'Loading the picture' : 'The picture cannot be shown here'}
            </div>
          )}
          {/* the part each size keeps; outside the first frame is dimmed */}
          {frames.map(({ size, i, box }) => (
            <div key={size} aria-hidden="true"
              className={cn('pointer-events-none absolute rounded-[2px] border-2', i === 0 ? 'border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]' : 'border-dashed border-white/90')}
              style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}>
              <span className="absolute left-1 top-1 rounded-sm bg-black/60 px-1 text-[10.5px] font-medium leading-4 text-white">{POST_SIZES[size]!.label}</span>
            </div>
          ))}
          {withFocal && (
            <span aria-hidden="true" className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/80 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: `${p.x}%`, top: `${p.y}%` }} />
          )}
        </div>
      </div>
      <p className="text-[12.5px] tabular-nums text-muted-foreground" aria-live="polite">{status}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {withZoom && (
          <label className="flex min-w-48 flex-1 items-center gap-2 text-[12.5px] text-muted-foreground">
            <span>Zoom</span>
            <input type="range" min={ZOOM.min} max={ZOOM.max} step={ZOOM.step} value={z} disabled={disabled} aria-valuetext={`${z.toFixed(1)} times`}
              className="w-full max-w-60 max-sm:h-8" onChange={(e) => { const v = Math.round(Number(e.target.value) * 10) / 10; onZoom(v <= 1 ? undefined : v); }} />
          </label>
        )}
        {(set || zoomOf(zoom) !== undefined) && (
          <Button type="button" variant="ghost" size="sm" className="max-sm:min-h-11" disabled={disabled} onClick={() => onChange(undefined, undefined)}>
            Use the layout's focus
          </Button>
        )}
      </div>
    </div>
  );
}

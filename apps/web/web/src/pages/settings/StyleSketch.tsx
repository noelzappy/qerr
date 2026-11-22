// A small sketch of posts in a brand's style: a poster with a photo, an editorial page with a card on its panel, a dark page and
// a photo post. It is drawn in the browser from the settings and the colours the server worked out (the palette), so people
// see what a change does before they save; the real images are always made by Qerr.
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { groundColours, isDarkColour, mix, type BrandSettings, type Palette } from './brand-types';

interface Props { s: BrandSettings; palette: Palette | null; logo?: string | null; artwork?: string | null; font?: string | null; className?: string; compact?: boolean }

const TRACK = (t: number | null | undefined, d: number) => `${t ?? d}em`;

export function StyleSketch({ s, palette, logo, artwork, font, className, compact = false }: Props) {
  const st = s.style;
  const grounds = { ...groundColours(s.colours, s.roles), ...(palette?.grounds ?? {}) };
  const ink = palette?.text.ink ?? s.roles.text.ink ?? s.colours.dark;
  const inverse = palette?.text.inverse ?? s.roles.text.inverse ?? '#ffffff';
  const body = palette?.text.body ?? mix(ink, '#ffffff', 0.85);
  const muted = palette?.text.muted ?? mix(ink, '#ffffff', 0.7);
  const mutedInv = palette?.text.mutedInv ?? mix('#ffffff', ink, 0.62);
  const primary = palette?.accents.primary ?? s.colours.primary;
  const gold = palette?.accents.gold ?? s.colours.accent;
  const panel = palette?.surfaces?.panel ?? s.colours.light;
  const card = palette?.surfaces?.card ?? '#ffffff';
  const outline = palette?.surfaces?.outline ?? ink;
  const colourOf = (role: string): string => ({ primary, accent: gold, ink, inverse } as Record<string, string>)[role] ?? grounds[role] ?? primary;
  const radius = s.corners === 'square' ? 1 : s.corners === 'round' ? 8 : 4;
  const family = font ? `'${font}', Inter, sans-serif` : undefined;
  const display: CSSProperties = {
    fontFamily: family, fontWeight: st.type.display.weight ?? Math.min(900, s.headlineWeight + 200), letterSpacing: TRACK(st.type.display.tracking, -0.03),
    textTransform: st.type.display.case === 'upper' ? 'uppercase' : 'none', lineHeight: 1.05,
  };
  const labelStyle = (colour: string): CSSProperties => ({
    fontFamily: st.type.label.font === 'mono' ? 'ui-monospace, monospace' : family, fontWeight: st.type.label.weight ?? 500, letterSpacing: TRACK(st.type.label.tracking, 0.07),
    textTransform: st.type.label.case === 'upper' ? 'uppercase' : 'none', color: colour, fontSize: 7,
  });
  // The headline's second half, as the brand's accent device sets it (the first post type decides when it follows the post type).
  const device = st.type.accent === 'series' ? (s.series[0]?.accent ?? 'muted') : st.type.accent;
  const second = (dark: boolean, poster: boolean): CSSProperties => {
    const d = poster && st.type.accent === 'series' && !s.series[0] ? 'colour' : device;
    if (d === 'none') return {};
    if (d === 'weight') return { fontWeight: Math.max(100, (st.type.display.weight ?? s.headlineWeight) - 300) };
    if (d === 'muted') return { color: dark ? mutedInv : muted };
    return { color: dark ? gold : primary };
  };
  const decoration = (dark: boolean, poster: boolean): CSSProperties => {
    const k = st.decoration.kind;
    if (k === 'none' || (!dark && st.decoration.on === 'dark')) return {};
    const c = dark ? `${inverse}33` : `${ink}22`;
    if (k === 'artwork') return artwork ? { backgroundImage: `url(${artwork})`, backgroundSize: st.decoration.fit === 'corner' ? '56% auto' : 'cover', backgroundPosition: st.decoration.fit === 'corner' ? 'right top' : 'center', backgroundRepeat: 'no-repeat' } : {};
    if (k === 'grid') return { backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: '14px 14px' };
    if (k === 'lines' || (k === 'auto' && poster)) return { backgroundImage: `repeating-linear-gradient(135deg, ${c} 0 1px, transparent 1px 4px)` };
    return { backgroundImage: `radial-gradient(${c} 0.7px, transparent 0.8px)`, backgroundSize: '7px 7px' };
  };
  const surface: CSSProperties = st.surface === 'outline' ? { boxShadow: `0 0 0 1.5px ${outline}` } : st.surface === 'flat' ? {} : { boxShadow: `0 4px 9px -3px ${ink}40, 0 0 0 1px ${ink}14` };
  const place = st.logo === 'auto' ? 'top-left' : st.logo;
  const mark = (dark: boolean) => (
    st.footer === 'pill'
      ? <span className="flex items-center rounded-[4px] px-1 py-0.5" style={{ background: isDarkColour(grounds.light!) ? inverse : grounds.light }}><Logo src={logo} colour={primary} /></span>
      : <span className="flex items-center gap-0.5"><Logo src={logo} colour={primary} /><span className="text-[6px] font-semibold" style={{ color: dark ? inverse : ink }}>{s.name}</span></span>
  );
  const bar = (dark: boolean, poster: boolean) => (
    <div className={cn('absolute inset-x-2 flex items-center justify-between', poster && place.startsWith('bottom') ? 'bottom-2' : poster ? 'top-2' : 'bottom-2', place.endsWith('right') && 'flex-row-reverse')}>
      {mark(dark)}
      {st.footer !== 'none' && <span className="text-[6px]" style={poster ? { color: dark ? mutedInv : body } : labelStyle(dark ? mutedInv : muted)}>{s.website}</span>}
    </div>
  );
  const photo = (
    <Photo treatment={st.photo.treatment} strength={st.photo.strength} colour={colourOf(st.photo.colour)} shadows={colourOf(st.photo.shadows)} highlights={colourOf(st.photo.highlights)} />
  );
  const posterGround = grounds[s.series[0]?.ground ?? 'cool'] ?? grounds.cool!;
  const posterDark = isDarkColour(posterGround);
  const tiles: Array<{ key: string; label: string; node: ReactNode }> = [
    {
      key: 'poster', label: 'A poster with a photo',
      node: (
        <Tile bg={posterGround} style={decoration(posterDark, true)}>
          {bar(posterDark, true)}
          <div className="absolute inset-x-2 top-7 text-[13px]" style={{ ...display, color: posterDark ? inverse : ink }}>Save together, <span style={second(posterDark, true)}>see every step.</span></div>
          <div className="absolute inset-x-0 bottom-0 h-[42%]">{photo}</div>
        </Tile>
      ),
    },
    {
      key: 'editorial', label: 'An editorial page with a card',
      node: (
        <Tile bg={grounds.light!} style={decoration(isDarkColour(grounds.light!), false)}>
          <div className="absolute inset-x-2 top-2 flex justify-between"><span style={labelStyle(muted)}>Savings sense</span><span style={labelStyle(muted)}>02 / 05</span></div>
          <div className="absolute inset-x-2 top-6 text-[11px]" style={{ ...display, fontWeight: st.type.display.weight ?? s.headlineWeight, color: isDarkColour(grounds.light!) ? inverse : ink }}>One ledger. <span style={second(isDarkColour(grounds.light!), false)}>Every deposit.</span></div>
          <div className="absolute inset-x-0 bottom-0 h-[48%]" style={{ background: panel, borderTop: st.surface === 'outline' ? `1.5px solid ${outline}` : st.surface === 'flat' ? undefined : `1px solid ${ink}14` }}>
            <div className="absolute inset-x-2 top-2 h-[55%]" style={{ background: card, borderRadius: radius, ...surface }}>
              {[0, 1, 2].map((i) => <div key={i} className="mx-1.5 mt-1.5 h-px" style={{ background: `${ink}33` }} />)}
            </div>
          </div>
          {bar(isDarkColour(panel), false)}
        </Tile>
      ),
    },
    {
      key: 'dark', label: 'A dark page',
      node: (
        <Tile bg={grounds.dark!} style={decoration(isDarkColour(grounds.dark!), true)}>
          {bar(isDarkColour(grounds.dark!), true)}
          <div className="absolute inset-x-2 top-1/3 text-[13px]" style={{ ...display, color: isDarkColour(grounds.dark!) ? inverse : ink }}>Every member <span style={second(isDarkColour(grounds.dark!), true)}>sees every deposit.</span></div>
        </Tile>
      ),
    },
    {
      key: 'photo', label: 'A photo post',
      node: (
        <Tile bg={grounds.dark!}>
          <div className="absolute inset-0">{photo}</div>
          <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,.55), transparent)' }} />
          <div className="absolute inset-x-2 top-3"><div style={{ ...labelStyle(inverse) }}>Community</div><div className="mt-1 text-[12px]" style={{ ...display, color: inverse }}>Saving together, <span style={device === 'none' ? {} : { color: gold }}>every week.</span></div></div>
          <div className={cn('absolute inset-x-2 bottom-2 flex items-center justify-between', place.endsWith('right') && 'flex-row-reverse')}>
            <span className="flex items-center rounded-[4px] px-1 py-0.5" style={{ background: isDarkColour(grounds.light!) ? inverse : grounds.light }}><Logo src={logo} colour={primary} /></span>
            {st.footer !== 'none' && <span style={{ ...labelStyle(inverse), textTransform: 'none', letterSpacing: '0.01em' }}>{s.website}</span>}
          </div>
        </Tile>
      ),
    },
  ];
  return (
    <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4', className)} aria-label="A sketch of posts in this style">
      {tiles.map((t) => <figure key={t.key} className="m-0"><div style={{ borderRadius: radius * 1.5 }} className="overflow-hidden border">{t.node}</div><figcaption className="mt-1 text-[11.5px] text-muted-foreground">{t.label}</figcaption></figure>)}
    </div>
  );
}

function Tile({ bg, style, children }: { bg: string; style?: CSSProperties; children: ReactNode }) {
  return <div className="relative aspect-[4/5] w-full overflow-hidden" style={{ background: bg, ...style }}>{children}</div>;
}

function Logo({ src, colour }: { src?: string | null; colour: string }) {
  return src ? <img src={src} alt="" className="size-3 object-contain" /> : <span className="inline-block size-3 rounded-[2px]" style={{ background: colour }} />;
}

// A stand-in photograph (sky, buildings, awnings) under the brand's photo treatment, drawn the way Qerr's stylesheet does it.
function Photo({ treatment, strength, colour, shadows, highlights }: { treatment: string; strength: number; colour: string; shadows: string; highlights: string }) {
  const scene: CSSProperties = {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(to bottom, #7fb2e5 0 38%, transparent 38%), repeating-linear-gradient(90deg, #e86a43 0 9%, #f4f1ea 9% 18%, #3b74c9 18% 27%, #f4f1ea 27% 36%), linear-gradient(to bottom, #c8b48e, #9a8b7f)',
    backgroundSize: '100% 100%, 100% 22%, 100% 100%', backgroundPosition: '0 0, 0 46%, 0 0', backgroundRepeat: 'no-repeat',
  };
  if (treatment === 'duotone') {
    return (
      <div className="absolute inset-0" style={{ background: highlights, isolation: 'isolate' }}>
        <div style={{ ...scene, filter: 'grayscale(1) contrast(1.08)', mixBlendMode: 'multiply' }} />
        <div className="absolute inset-0" style={{ background: shadows, mixBlendMode: 'lighten' }} />
      </div>
    );
  }
  return (
    <div className="absolute inset-0" style={{ isolation: 'isolate' }}>
      <div style={scene} />
      {treatment === 'tint' && <div className="absolute inset-0" style={{ background: colour, mixBlendMode: 'color', opacity: strength }} />}
      {treatment === 'overlay' && <div className="absolute inset-0" style={{ background: colour, opacity: strength }} />}
    </div>
  );
}

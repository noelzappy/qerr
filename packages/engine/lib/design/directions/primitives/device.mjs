// Primitive: a device drawn round the post's picture, a bare screenshot of an app (kit device): a modern phone (a rounded body, a camera
// island or a notch, side buttons) or a tablet, in a light, dark or brand-colour finish, turned a little and lifted on a soft shadow. Every
// line of the frame is drawn by the kit from whole pixels worked out here from the place's size and fixed shares of the model; colours are
// palette roles and fixed device finishes in kit.css. The screenshot fills the screen with cover round the post's focal point and the screen's
// corner radius clips it; it is read and checked like every picture (its enlargement is checked). A pre-framed capture (the device already
// drawn into a transparent picture: its four corners are see-through) is shown whole, as it is, and the drawn frame is left out (runtime.mjs
// ready() marks it), so a phone is never framed twice. A bare screenshot far from the model's proportions is refused (render.mjs, screenFit).
import { ALIGNS, bool, en, int } from '../../look-desc.mjs';

export const DEVICE_MODELS = ['phone', 'tablet'];
export const DEVICE_FINISHES = ['light', 'dark', 'brand'];
export const DEVICE_CUTOUTS = ['island', 'notch', 'none'];
// The most a device turns, in degrees (either way): a small lean, never a spin.
export const DEVICE_TILT = 6;
// The proportions of each model (height over width of the body), the share of its width that is bezel and corner, and the screenshots each
// takes: a portrait screenshot from `lo` to `hi` times as tall as it is wide (outside that it is refused; inside it is cropped to the screen).
export const MODELS = Object.freeze({
  phone: Object.freeze({ aspect: 2.04, bezel: 0.034, radius: 0.155, lo: 1.6, hi: 2.4, word: 'phone' }),
  tablet: Object.freeze({ aspect: 1.4, bezel: 0.045, radius: 0.06, lo: 1.15, hi: 1.6, word: 'tablet' }),
});
// Above this share of the screenshot cut away to fill the screen, the render says so (a warning); below it, a note.
export const CROP_WARN = 0.06;

export const SPEC = {
  label: 'Device', group: 'Pictures', help: 'The post\'s picture, a bare app screenshot, shown on a phone or tablet the engine draws round it: a rounded body, a camera island or notch, side buttons, a light, dark or brand-colour finish, a slight turn and a soft shadow. A capture that already has the phone drawn round it is shown as it is.',
  placement: 'required', flow: false, container: null, text: false,
  own: {
    model: en(DEVICE_MODELS, 'Device', 'A phone or a tablet.', 'phone'),
    finish: en(DEVICE_FINISHES, 'Finish', 'A light (silver) body, a dark body, or a body in the brand colour.', 'dark'),
    cutout: en(DEVICE_CUTOUTS, 'Camera', 'A phone\'s camera: an island in the screen, a notch at its top edge, or none (a tablet has none).', 'island'),
    buttons: bool('Side buttons', 'Draws the side buttons on the edges of the body.', true),
    tilt: int(-DEVICE_TILT, DEVICE_TILT, 'Lean', `Turns the device by up to ${DEVICE_TILT} degrees either way (scaled by the look's tilt dial).`, 0),
    align: en(ALIGNS, 'Align', 'Where the device sits across its place when the place is wider than the device.', 'center'),
  },
  common: ['place', 'z', 'when', 'shadow'],
  required: [],
};

// For the static checks (look-static.mjs): it shows the image, is a picture (text over it needs a filled box), and its lean counts as a turn.
export const bindings = () => [{ field: 'image', sig: 'image|all' }];
export const picture = true;
export const turned = (el) => Number.isFinite(el.tilt) && el.tilt !== 0;
export function rules(el, bad) {
  const pl = el.place;
  if (pl && !(pl.px && pl.px.w !== undefined && pl.px.h !== undefined) && pl.grid === undefined && pl.inset === undefined) bad('needs a place with a width and a height (pixels with w and h, a grid place, or an inset)', 'place');
  if (pl?.px && Number.isFinite(pl.px.w) && Number.isFinite(pl.px.h) && Math.min(pl.px.w, pl.px.h / (MODELS[el.model ?? 'phone']?.aspect ?? 2)) < 160) bad('leaves the device less than 160 pixels wide; give it a larger place', 'place');
  if (el.model === 'tablet' && el.cutout !== undefined && el.cutout !== 'none') bad('is a phone\'s camera; a tablet has none (leave it out or set none)', 'cutout');
  if (el.shadow !== undefined && el.shadow !== 'soft' && el.shadow !== 'lift') bad('a device takes a soft shadow (soft or lift)', 'shadow');
}

// The geometry of a device in a box of w x h px: the body as large as fits at the model's proportions, sat by `align` across and centred down;
// the screen inside its bezel; the camera and the buttons. Whole pixels, all from fixed shares. -> { x, y, w, h, radius, screen, cut, buttons }.
export function deviceGeometry({ w, h, model = 'phone', cutout = 'island', buttons = true, align = 'center' }) {
  const M = MODELS[model];
  if (!M) throw new Error('look: a device is a phone or a tablet');
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error('look: a device needs a place with a width and a height');
  const bw = Math.floor(Math.min(w, h / M.aspect)), bh = Math.round(bw * M.aspect);
  if (bw < 160) throw new Error('look: the device is too small for its place (under 160 px wide)');
  const x = align === 'left' ? 0 : align === 'right' ? Math.floor(w - bw) : Math.floor((w - bw) / 2), y = Math.floor((h - bh) / 2);
  const bezel = Math.max(6, Math.round(bw * M.bezel)), radius = Math.round(bw * M.radius);
  const screen = { x: bezel, y: bezel, w: bw - 2 * bezel, h: bh - 2 * bezel, radius: Math.max(0, radius - bezel) };
  let cut = null;
  if (model === 'phone' && cutout === 'island') { const cw = Math.round(bw * 0.29), ch = Math.round(bw * 0.082); cut = { kind: 'island', x: Math.round((bw - cw) / 2), y: bezel + Math.round(bw * 0.03), w: cw, h: ch }; }
  if (model === 'phone' && cutout === 'notch') { const cw = Math.round(bw * 0.46), ch = Math.round(bw * 0.07); cut = { kind: 'notch', x: Math.round((bw - cw) / 2), y: bezel, w: cw, h: ch }; }
  const t = Math.max(3, Math.round(bw * 0.012));
  // side buttons, as [side, top share, height share]: a phone's action and volume buttons on the left, its power button on the right; a tablet's top button
  const SIDE = model === 'phone' ? [['left', 0.17, 0.04], ['left', 0.235, 0.075], ['left', 0.325, 0.075], ['right', 0.27, 0.11]] : [['right', 0.1, 0.06]];
  const btns = buttons ? SIDE.map(([side, top, len]) => ({ side, x: side === 'left' ? -t + 1 : bw - 1, y: Math.round(bh * top), w: t, h: Math.round(bh * len) })) : [];
  return { x, y, w: bw, h: bh, radius, screen, cut, buttons: btns };
}

// Whether a bare screenshot fits the device's screen, and how much is cut away to fill it. nw, nh: the screenshot's own size; sw, sh: the screen's.
// -> { ok: false, problem } when it is far from the model's proportions; else { ok: true, crop (share cut away), at ('top and bottom' | 'sides'), warning? }.
// The message names sizes only (numbers read from the file), never the file's name or anything from the post.
export function screenFit({ nw, nh, sw, sh, model = 'phone' }) {
  const M = MODELS[model] ?? MODELS.phone;
  if (![nw, nh, sw, sh].every((v) => Number.isFinite(v) && v > 0)) return { ok: false, problem: `the screenshot on the ${M.word} could not be measured` };
  const r = nh / nw, R = sh / sw, ratio = (v) => (Math.round(v * 100) / 100).toFixed(2);
  if (r < M.lo || r > M.hi) {
    return { ok: false, problem: `the screenshot on the ${M.word} is ${Math.round(nw)} x ${Math.round(nh)} px, ${ratio(r)} times as tall as it is wide; a ${M.word} screen takes a portrait screenshot ${M.lo} to ${M.hi} times as tall as it is wide (${r < M.lo ? 'this one is too wide: a landscape or desktop screenshot' : 'this one is too tall: a scrolling capture'}). Use a ${M.word} screenshot, or a capture with the ${M.word} already drawn round it` };
  }
  const crop = r > R ? 1 - R / r : 1 - r / R, at = r > R ? 'top and bottom' : 'sides', pct = Math.round(crop * 100);
  const out = { ok: true, crop: +crop.toFixed(4), at };
  if (crop > CROP_WARN) out.warning = `the screenshot on the ${M.word} was cropped by ${pct}% at the ${at} to fill the screen (a screenshot about ${ratio(R)} times as tall as it is wide fits without cropping; set focal to choose what stays)`;
  else if (pct > 0) out.note = `the screenshot on the ${M.word} was cropped by ${pct}% at the ${at} to fill the screen`;
  return out;
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export function render(c, p, env) {
  if (!c.hasImage) return '';
  const b = env.box;
  if (!Number.isFinite(b.w) || !Number.isFinite(b.h)) throw new Error('look: a device needs a place with a width and a height');
  const model = p.model ?? 'phone';
  const g = deviceGeometry({ w: b.w, h: b.h, model, cutout: model === 'tablet' ? 'none' : p.cutout ?? 'island', buttons: p.buttons !== false, align: p.align ?? 'center' });
  const tilt = env.angle(p.tilt ?? 0);
  if (Math.abs(tilt) > DEVICE_TILT * 1.5 + 1e-9) throw new Error(`look: a device leans at most ${DEVICE_TILT * 1.5} degrees`);
  const soft = typeof p.shadow === 'string' && p.shadow !== 'hard' ? p.shadow : undefined;
  return c.device(clean({ x: b.x + g.x, y: b.y + g.y, geometry: g, model, finish: p.finish ?? 'dark', tilt: tilt || undefined, soft, z: env.z }));
}

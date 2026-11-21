// PNG -> JPG through whatever the machine has, behind one small adapter. Order: sips (macOS), then ffmpeg. With neither, the
// renderer asks Chrome itself for a JPEG (a plain re-capture), so a JPG is always possible.
import { spawnSync } from 'node:child_process';

const works = (cmd, args) => { try { return spawnSync(cmd, args, { stdio: 'ignore' }).status === 0; } catch { return false; } };

export function detectConverter({ probe = works } = {}) {
  if (probe('sips', ['--help'])) return { name: 'sips', args: (i, o, q) => ['sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(q), i, '--out', o]] };
  if (probe('ffmpeg', ['-version'])) return { name: 'ffmpeg', args: (i, o, q) => ['ffmpeg', ['-v', 'error', '-y', '-i', i, '-q:v', String(Math.max(2, Math.round((100 - q) / 4) + 1)), o]] };
  return null;
}

export function convertToJpeg(converter, pngPath, jpgPath, quality = 92) {
  const [cmd, args] = converter.args(pngPath, jpgPath, quality);
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${converter.name} could not convert the image: ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`);
}

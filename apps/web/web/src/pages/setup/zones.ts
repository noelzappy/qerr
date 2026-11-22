// The time zones offered on the first step. Until the shared TimeZonePicker lands, this is the browser's own list with the
// current zone kept even when the browser does not list it; swap the select for the picker in StepBrand when it does.
function allZones(): string[] {
  try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['UTC']; } catch { return ['UTC']; }
}
const ZONES = allZones();

export function zoneOptions(current: string): Array<{ value: string; label: string }> {
  return (ZONES.includes(current) ? ZONES : [current, ...ZONES]).map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
}

// The rules of the contrast control for large headlines (contrast-display.tsx): modes, the 3 to 7 range and the note below 4.5.
export const DISPLAY_STANDARD = 4.5, DISPLAY_HIGH = 7, DISPLAY_MIN = 3, DISPLAY_MAX = 7;
export type DisplayMode = 'standard' | 'high' | 'custom';
export const displayMode = (v: number | null): DisplayMode => (v === null || v === DISPLAY_STANDARD ? 'standard' : v === DISPLAY_HIGH ? 'high' : 'custom');
export const displayProblem = (v: number | null): string => (v === null || (Number.isFinite(v) && v >= DISPLAY_MIN && v <= DISPLAY_MAX) ? '' : `Use a ratio from ${DISPLAY_MIN} to ${DISPLAY_MAX}`);
export const displayNote = (v: number | null): string => (v !== null && Number.isFinite(v) && v < DISPLAY_STANDARD ? 'Below the standard for normal text; fine for large headlines only.' : '');


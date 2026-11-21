// Two small pieces of shared state for the Brand and look page, so a field deep in a section can talk to the page without props:
//   upload status   which uploads were just saved (they are saved the moment a file is chosen) and which failed
//   field problems  fields whose text is not a valid value yet; the page will not save while there is one
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';

interface Status {
  saved: Record<string, true>;
  errors: Record<string, string>;
  markSaved: (key: string) => void;
  setError: (key: string, message: string) => void;
  clear: (key: string) => void;
}
const StatusContext = createContext<Status | null>(null);

// How long "Saved straight away" stays next to a control.
const SAVED_FOR_MS = 12000;

export function useUploadStatusState(): Status {
  const [saved, setSaved] = useState<Record<string, true>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => { for (const t of Object.values(timers.current)) clearTimeout(t); }, []);
  const clear = useCallback((key: string) => {
    clearTimeout(timers.current[key]);
    setSaved((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
    setErrors((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
  }, []);
  const markSaved = useCallback((key: string) => {
    clearTimeout(timers.current[key]);
    setErrors((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
    setSaved((p) => ({ ...p, [key]: true }));
    timers.current[key] = setTimeout(() => setSaved((p) => { const n = { ...p }; delete n[key]; return n; }), SAVED_FOR_MS);
  }, []);
  const setError = useCallback((key: string, message: string) => {
    clearTimeout(timers.current[key]);
    setSaved((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
    setErrors((p) => ({ ...p, [key]: message }));
  }, []);
  return useMemo(() => ({ saved, errors, markSaved, setError, clear }), [saved, errors, markSaved, setError, clear]);
}

export function UploadStatusProvider({ value, children }: { value: Status; children: ReactNode }) {
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

// The saved flag and the error of one upload, by its key.
export function useUploadStatus(key: string | undefined): { saved: boolean; error: string } {
  const c = useContext(StatusContext);
  return { saved: !!(key && c?.saved[key]), error: (key && c?.errors[key]) || '' };
}

// The confirmation that sits next to an upload.
export function SavedNote({ className }: { className?: string }) {
  return (
    <span role="status" className={`inline-flex items-center gap-1 text-[13px] font-medium text-success ${className ?? ''}`}>
      <Check className="size-3.5" aria-hidden="true" /> Saved straight away
    </span>
  );
}

// ---- field problems ----

const ProblemsContext = createContext<((id: string, message: string) => void) | null>(null);

export function useFieldProblemsState(): { problems: Record<string, string>; report: (id: string, message: string) => void } {
  const [problems, setProblems] = useState<Record<string, string>>({});
  const report = useCallback((id: string, message: string) => {
    setProblems((p) => {
      if ((p[id] ?? '') === message) return p;
      const n = { ...p };
      if (message) n[id] = message; else delete n[id];
      return n;
    });
  }, []);
  return { problems, report };
}

export function FieldProblemsProvider({ report, children }: { report: (id: string, message: string) => void; children: ReactNode }) {
  return <ProblemsContext.Provider value={report}>{children}</ProblemsContext.Provider>;
}

// A field calls this with its message while its text is not a valid value yet, and with '' when it is (or when it goes away).
export function useReportProblem(id: string, message: string) {
  const report = useContext(ProblemsContext);
  useEffect(() => {
    report?.(id, message);
    return () => report?.(id, '');
  }, [report, id, message]);
}

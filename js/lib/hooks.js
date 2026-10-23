// Hooks para suscribirse a Firestore desde los componentes.
import { useState, useEffect, useMemo } from './deps.js';
import { store, useStore } from './store.js';

/**
 * useWatch((fb, ok, fail) => fb.watchX(..., ok, fail), [deps])
 * Devuelve { data, error, loading }. data = undefined mientras carga.
 */
export function useWatch(factory, deps) {
  const fbReady = useStore((s) => !!s.fb);
  const [state, setState] = useState({ data: undefined, error: null });
  useEffect(() => {
    const fb = store.get().fb;
    if (!fb) return undefined;
    setState({ data: undefined, error: null });
    const unsub = factory(fb, (data) => setState({ data, error: null }), (error) => {
      console.warn(error);
      setState({ data: null, error });
    });
    return () => unsub && unsub();
  }, [fbReady, ...deps]);
  return { ...state, loading: state.data === undefined && !state.error };
}

/** Busca un ejercicio por id en el catálogo base + propios. */
export function useExerciseIndex() {
  const base = useStore((s) => s.catalog);
  const custom = useStore((s) => s.custom);
  return useMemo(() => {
    const m = new Map();
    for (const e of base || []) m.set(e.id, e);
    for (const e of custom) m.set(e.id, e);
    return m;
  }, [base, custom]);
}

export type Toast = { id: number; message: string; tone: "success" | "error" | "achievement"; leaving?: boolean };

/** How long a toast takes to fade out; matches `.toast-out`. */
const LEAVE_MS = 200;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function push(message: string, tone: Toast["tone"]) {
  const id = nextId++;
  toasts = [...toasts.slice(-2), { id, message, tone }];
  emit();
  setTimeout(() => {
    toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    emit();
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      emit();
    }, LEAVE_MS);
  }, tone === "achievement" ? 6000 : 3500);
}

export const toast = {
  success: (message: string) => push(message, "success"),
  error: (message: string) => push(message, "error"),
  achievement: (message: string) => push(message, "achievement"),
};

/** For useSyncExternalStore in <Toaster>. */
export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const currentToasts = () => toasts;

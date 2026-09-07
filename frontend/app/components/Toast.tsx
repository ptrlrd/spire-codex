"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useT } from "@/lib/i18n";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const colors: Record<ToastType, string> = {
    success: "border-success/40 bg-success/10 text-success",
    error: "border-danger/40 bg-danger/10 text-danger",
    info: "border-[var(--border-accent)] bg-[var(--bg-card)] text-[var(--text-primary)]",
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[calc(100vw-2rem)] sm:max-w-sm">
          {toasts.map((item) => (
            <div
              key={item.id}
              className={`px-4 py-3 rounded-lg border text-sm shadow-lg shadow-scrim/20 flex items-start gap-2 animate-in slide-in-from-right ${colors[item.type]}`}
              role="alert"
            >
              <span className="flex-1 break-words">{item.message}</span>
              <button
                onClick={() => dismiss(item.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                aria-label={t("Dismiss")}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

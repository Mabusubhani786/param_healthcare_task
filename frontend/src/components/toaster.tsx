import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: "default" | "success" | "error" | "warning"
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((data: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts((prev) => [...prev, { ...data, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  useEffect(() => {
    window.__addToast = addToast
    return () => {
      delete window.__addToast
    }
  }, [addToast])

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  const variantStyles: Record<string, string> = {
    default: "bg-background border text-foreground",
    success: "bg-green-50 border-green-200 text-green-800",
    error: "bg-red-50 border-red-200 text-red-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border p-3 shadow-lg animate-in slide-in-from-bottom-5 ${variantStyles[t.variant ?? "default"]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && (
                <p className="text-xs mt-1 opacity-80 whitespace-pre-wrap">{t.description}</p>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

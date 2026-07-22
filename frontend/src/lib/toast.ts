import type { Toast } from "@/components/toaster"

export function toast(toastData: Omit<Toast, "id">) {
  window.__addToast?.(toastData)
}

declare global {
  interface Window {
    __addToast?: (data: Omit<Toast, "id">) => void
  }
}

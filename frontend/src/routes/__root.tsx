import { createRootRoute, Outlet } from "@tanstack/react-router"
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/toaster"

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <TooltipProvider>
        <Outlet />
        <Toaster />
        {/* <TanStackRouterDevtools /> */}
      </TooltipProvider>
    </ThemeProvider>
  ),
})

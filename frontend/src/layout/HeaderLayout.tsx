import { useRouterState } from "@tanstack/react-router"
import { MoonIcon, SunIcon } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"

function formatTitle(pathname: string) {
  if (pathname === "/" || pathname === "") {
    return "Dashboard"
  }

  const segment = pathname.split("/").filter(Boolean).at(-1) ?? "dashboard"
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

export function HeaderLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { theme, setTheme } = useTheme()

  const resolvedTheme = theme === "system" ? "dark" : theme
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark"

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border border-b-0 bg-card/95 px-4 text-card-foreground backdrop-blur md:px-6">
      <SidebarTrigger />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {formatTitle(pathname)}
        </p>
        <p className="truncate text-xs text-muted-foreground">{pathname}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setTheme(nextTheme)}
        className="gap-2"
      >
        {resolvedTheme === "dark" ? (
          <SunIcon className="size-4" />
        ) : (
          <MoonIcon className="size-4" />
        )}
        <span className="capitalize">{nextTheme}</span>
      </Button>
    </header>
  )
}

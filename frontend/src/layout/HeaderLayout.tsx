import { useRouterState } from "@tanstack/react-router"
import { BellIcon, MoonIcon, SunIcon } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const notifications = [
  {
    title: "Roster generated",
    description: "The roster for July 2026 was generated successfully.",
    time: "2m ago",
  },
  {
    title: "Profile updated",
    description: "Your account settings were updated successfully.",
    time: "1h ago",
  },
  {
    title: "Deployment ready",
    description: "The latest frontend build is available for review.",
    time: "3h ago",
  },
] as const

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
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="relative"
            type="button"
            aria-label="Open notifications"
          >
            <BellIcon className="size-4" />
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80" sideOffset={10}>
          <PopoverHeader>
            <PopoverTitle>Notifications</PopoverTitle>
            <PopoverDescription>
              You have {notifications.length} unread updates.
            </PopoverDescription>
          </PopoverHeader>
          <Separator />
          <div className="flex flex-col gap-1">
            {notifications.map((notification) => (
              <div
                key={notification.title}
                className="rounded-md px-2 py-2 transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{notification.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {notification.description}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {notification.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
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

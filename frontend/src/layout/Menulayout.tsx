import { Link, useRouterState } from "@tanstack/react-router"
import {
  CalendarDays,
  PanelLeftClose,
  Stethoscope,
  Umbrella,
  Clock,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const navigationItems = [
  { title: "Roster", to: "/roster", icon: CalendarDays },
  { title: "Doctors", to: "/doctors", icon: Stethoscope },
  { title: "Leaves", to: "/leaves", icon: Umbrella },
  { title: "Shifts", to: "/shifts", icon: Clock },
] as const

export function Menulayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-16 justify-center rounded-t-xl border border-b-0 border-sidebar-border bg-sidebar px-3 py-0">
        <Link
          to="/roster"
          className="flex h-10 items-center gap-3 rounded-lg px-2 py-1 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <PanelLeftClose className="size-4" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">Roster</p>
            <p className="truncate text-xs text-muted-foreground">
              Duty Doctor Schedule
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="border-x border-sidebar-border bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel>Pages</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const isActive =
                  pathname === item.to || pathname.startsWith(`${item.to}/`)

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
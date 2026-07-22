import { Link, useRouterState } from "@tanstack/react-router"
import {
  CalendarDays,
  PanelLeftClose,
} from "lucide-react"
import * as React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
] as const

const userProfile = {
  name: "Masani",
  role: "Frontend Developer",
  email: "masani@example.com",
}

export function Menulayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [profileOpen, setProfileOpen] = React.useState(false)

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

      <SidebarFooter className="rounded-b-xl border border-t-0 border-sidebar-border bg-sidebar p-3">
        <Popover open={profileOpen} onOpenChange={setProfileOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onMouseEnter={() => setProfileOpen(true)}
              onMouseLeave={() => setProfileOpen(false)}
              onFocus={() => setProfileOpen(true)}
              onBlur={() => setProfileOpen(false)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none"
            >
              <Avatar size="lg">
                <AvatarImage
                  src="https://api.dicebear.com/9.x/initials/svg?seed=Masani"
                  alt={userProfile.name}
                />
                <AvatarFallback>
                  {userProfile.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {userProfile.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {userProfile.role}
                </p>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="end"
            sideOffset={12}
            onMouseEnter={() => setProfileOpen(true)}
            onMouseLeave={() => setProfileOpen(false)}
            className="w-64"
          >
            <div className="flex items-center gap-3">
              <Avatar size="lg">
                <AvatarImage
                  src="https://api.dicebear.com/9.x/initials/svg?seed=Masani"
                  alt={userProfile.name}
                />
                <AvatarFallback>
                  {userProfile.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <PopoverHeader className="gap-1">
                <PopoverTitle>{userProfile.name}</PopoverTitle>
                <PopoverDescription>{userProfile.role}</PopoverDescription>
              </PopoverHeader>
            </div>
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {userProfile.email}
            </div>
            <Separator />
            <div className="flex flex-col gap-1">
              <Link
                to="/roster"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <CalendarDays className="size-4" />
                <span>Roster</span>
              </Link>
            </div>
            <Separator />
            <button
              type="button"
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
            >
              <span>Sign out</span>
            </button>
          </PopoverContent>
        </Popover>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
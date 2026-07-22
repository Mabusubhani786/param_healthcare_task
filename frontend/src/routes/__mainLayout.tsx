import { createFileRoute, Outlet } from "@tanstack/react-router"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { HeaderLayout } from "@/layout/HeaderLayout"
import { Menulayout } from "@/layout/Menulayout"

export const Route = createFileRoute("/__mainLayout")({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <SidebarProvider>
      <Menulayout />
      <SidebarInset className="min-h-0">
        <HeaderLayout />
        <div className="flex-1 p-6 w-full flex flex-col h-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

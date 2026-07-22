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
      <SidebarInset>
        <HeaderLayout />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

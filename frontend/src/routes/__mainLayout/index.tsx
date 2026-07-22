import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/__mainLayout/")({
  beforeLoad: () => {
    throw redirect({ to: "/roster" })
  },
})
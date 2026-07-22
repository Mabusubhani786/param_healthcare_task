import { createFileRoute } from "@tanstack/react-router"
import { MoreHorizontal, Pencil, Trash2, Plus, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DataTable, sortableHeader } from "@/components/ui/data-table"
import { toast } from "@/lib/toast"
import { getDoctors } from "@/das/doctor.das"
import {
  getLeaves as dasGetLeaves,
  createLeave as dasCreateLeave,
  updateLeave as dasUpdateLeave,
  deleteLeave as dasDeleteLeave,
  type LeaveWithDoctor,
} from "@/das/leave.das"
import { format } from "date-fns"

function LeavesPage() {
  const [leaves, setLeaves] = useState<LeaveWithDoctor[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [doctorOptions, setDoctorOptions] = useState<{ id: string; name: string }[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ doctor_id: "", leave_date: "", reason: "" })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LeaveWithDoctor | null>(null)

  const fetchLeaves = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const { doctors: docs } = await getDoctors(1, 100)
      const { leaves: data, pagination } = await dasGetLeaves(docs, p, 5)
      setLeaves(data)
      setPage(pagination.current_page)
      setTotalPages(pagination.total_page_count)
      setDoctorOptions(docs.map((d) => ({ id: d.id, name: d.name })))
    } catch {
      toast({ title: "Failed to load leaves", variant: "error" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeaves(1) }, [fetchLeaves])

  const openCreate = () => {
    setForm({ doctor_id: "", leave_date: "", reason: "" })
    setEditingId(null)
    setFormOpen(true)
  }

  const openEdit = (leave: LeaveWithDoctor) => {
    setForm({
      doctor_id: leave.doctor_id,
      leave_date: leave.leave_date,
      reason: leave.reason ?? "",
    })
    setEditingId(leave.id)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.doctor_id || !form.leave_date) {
      toast({ title: "Doctor and date are required", variant: "error" })
      return
    }
    setSaving(true)
    try {
      const payload = {
        doctor_id: form.doctor_id,
        leave_date: form.leave_date,
        reason: form.reason.trim() || undefined,
      }
      if (editingId) {
        await dasUpdateLeave(editingId, payload)
        toast({ title: "Leave updated", variant: "success" })
      } else {
        await dasCreateLeave(payload)
        toast({ title: "Leave added", variant: "success" })
      }
      setFormOpen(false)
      setForm({ doctor_id: "", leave_date: "", reason: "" })
      await fetchLeaves(1)
    } catch (err) {
      toast({ title: editingId ? "Update failed" : "Failed to add leave", description: (err as Error).message, variant: "error" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      await dasDeleteLeave(target.id)
      toast({ title: "Leave removed", variant: "success" })
      await fetchLeaves(1)
    } catch {
      toast({ title: "Failed to delete leave", variant: "error" })
    }
  }

  const columns: ColumnDef<LeaveWithDoctor>[] = useMemo(() => [
    {
      accessorKey: "doctorName",
      header: sortableHeader("Doctor"),
      cell: ({ row }) => <span className="font-medium">{row.original.doctorName}</span>,
    },
    {
      accessorKey: "leave_date",
      header: sortableHeader("Date"),
      cell: ({ row }) => <span>{format(new Date(row.original.leave_date), "MMM d, yyyy")}</span>,
    },
    {
      id: "day",
      header: "Day",
      cell: ({ row }) => <span className="text-muted-foreground">{format(new Date(row.original.leave_date), "EEEE")}</span>,
    },
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.reason || "—"}</span>,
    },
    {
      id: "actions",
      header: "Action",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs">
              <MoreHorizontal className="size-3.5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(row.original)}>
              <Pencil className="size-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="size-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  return (
    <div className="flex flex-1 flex-col h-0 gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leaves</h2>
          <p className="text-sm text-muted-foreground">Manage doctor leave records</p>
        </div>
        <Button onClick={openCreate}><Plus className="size-4 mr-2" />Add Leave</Button>
      </div>

      <DataTable
        columns={columns}
        data={leaves}
        loading={loading}
        emptyMessage="No leaves recorded"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => fetchLeaves(p)}
      />

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setFormOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingId ? "Edit Leave" : "Add Leave"}</h3>
              <Button variant="ghost" size="icon" onClick={() => setFormOpen(false)}><X className="size-4" /></Button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Doctor *</label>
                <select value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm bg-background">
                  <option value="">Select...</option>
                  {doctorOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Date *</label>
                <input type="date" value={form.leave_date} onChange={(e) => setForm({ ...form, leave_date: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Reason</label>
                <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm bg-background" placeholder="Optional" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? "Saving..." : editingId ? "Update" : "Add Leave"}</Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete leave for {deleteTarget?.doctorName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>Remove the leave record for <strong>{deleteTarget.doctorName}</strong> on <strong>{format(new Date(deleteTarget.leave_date), "MMM d, yyyy")}</strong>?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export const Route = createFileRoute("/__mainLayout/leaves")({
  component: LeavesPage,
})

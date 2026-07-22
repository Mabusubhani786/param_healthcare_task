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
import {
  getDoctors as dasGetDoctors,
  createDoctor as dasCreateDoctor,
  updateDoctor as dasUpdateDoctor,
  deleteDoctor as dasDeleteDoctor,
  type DoctorWithMeta,
} from "@/das/doctor.das"
import type { DoctorGender, Weekday } from "@/types/roster.types"

const GENDERS: DoctorGender[] = ["male", "female"]
const WEEKDAYS: Weekday[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]
const WEEKDAY_LABELS: Record<string, string> = {
  sunday: "Sunday", monday: "Monday", tuesday: "Tuesday",
  wednesday: "Wednesday", thursday: "Thursday", friday: "Friday",
  saturday: "Saturday",
}
const SHIFT_COLORS: Record<string, string> = {
  morning: "bg-amber-100 text-amber-800 border-amber-300",
  day: "bg-sky-100 text-sky-800 border-sky-300",
  afternoon: "bg-orange-100 text-orange-800 border-orange-300",
  night: "bg-indigo-100 text-indigo-800 border-indigo-300",
  obgyn: "bg-emerald-100 text-emerald-800 border-emerald-300",
}

const ALL_SHIFTS = ["morning", "day", "afternoon", "night", "obgyn"]

const emptyForm = {
  slug: "", name: "", gender: "male" as DoctorGender,
  weekly_off: "sunday" as Weekday, allowed_shifts: [] as string[], notes: "",
}

function DoctorsPage() {
  const [doctors, setDoctors] = useState<DoctorWithMeta[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DoctorWithMeta | null>(null)

  const fetchDoctors = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const { doctors: data, pagination } = await dasGetDoctors(p, 5)
      setDoctors(data)
      setTotalPages(pagination.total_page_count)
      setPage(pagination.current_page)
    } catch {
      toast({ title: "Failed to load doctors", variant: "error" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDoctors(1) }, [fetchDoctors])

  const openCreate = () => {
    setForm({ ...emptyForm, allowed_shifts: [] })
    setEditingId(null)
    setFormOpen(true)
  }

  const openEdit = (doc: DoctorWithMeta) => {
    setForm({
      slug: doc.slug, name: doc.name, gender: doc.gender,
      weekly_off: doc.weekly_off, allowed_shifts: [...doc.allowed_shifts],
      notes: doc.notes ?? "",
    })
    setEditingId(doc.id)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.slug.trim() || !form.name.trim()) {
      toast({ title: "Slug and name are required", variant: "error" })
      return
    }
    setSaving(true)
    try {
      const selectedShifts = form.gender === "male"
        ? form.allowed_shifts.filter((s) => s !== "obgyn")
        : form.allowed_shifts
      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        gender: form.gender,
        weekly_off: form.weekly_off,
        allowed_shifts: selectedShifts,
        notes: form.notes.trim() || undefined,
      }
      if (editingId) {
        await dasUpdateDoctor(editingId, payload as any)
        toast({ title: "Doctor updated", variant: "success" })
      } else {
        await dasCreateDoctor(payload)
        toast({ title: "Doctor created", variant: "success" })
      }
      setFormOpen(false)
      await fetchDoctors(1)
    } catch (err) {
      toast({ title: editingId ? "Update failed" : "Create failed", description: (err as Error).message, variant: "error" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    setDeleteTarget(null)
    try {
      await dasDeleteDoctor(id)
      toast({ title: `${name} deleted`, variant: "success" })
      await fetchDoctors(1)
    } catch (err) {
      toast({ title: "Delete failed", description: (err as Error).message, variant: "error" })
    }
  }

  const columns: ColumnDef<DoctorWithMeta>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: sortableHeader("Name"),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "slug",
      header: sortableHeader("Slug"),
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.slug}</span>,
    },
    {
      accessorKey: "gender",
      header: sortableHeader("Gender"),
      cell: ({ row }) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          row.original.gender === "female" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"
        }`}>
          {row.original.genderLabel}
        </span>
      ),
    },
    {
      accessorKey: "weekly_off",
      header: sortableHeader("Weekly Off"),
      cell: ({ row }) => <span>{row.original.weeklyOffLabel}</span>,
    },
    {
      id: "allowed_shifts",
      header: "Allowed Shifts",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.allowed_shifts.map((s) => (
            <span key={s} className={`inline-block rounded border px-1.5 py-0.5 text-[0.688rem] font-medium ${SHIFT_COLORS[s] ?? "bg-muted text-muted-foreground"}`}>{s}</span>
          ))}
        </div>
      ),
    },
    {
      accessorKey: "notes",
      header: "Notes",
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate max-w-[12.5rem] inline-block">{row.original.notes ?? "—"}</span>,
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
          <h2 className="text-2xl font-bold tracking-tight">Doctors</h2>
          <p className="text-sm text-muted-foreground">Manage doctor profiles and constraints</p>
        </div>
        <Button onClick={openCreate}><Plus className="size-4 mr-2" />Add Doctor</Button>
      </div>

      <DataTable
        columns={columns}
        data={doctors}
        loading={loading}
        emptyMessage="No doctors found"
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => fetchDoctors(p)}
      />

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setFormOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl border max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingId ? "Edit Doctor" : "Add Doctor"}</h3>
              <Button variant="ghost" size="icon" onClick={() => setFormOpen(false)}><X className="size-4" /></Button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Slug *</label>
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm bg-background" placeholder="meera" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm bg-background" placeholder="Dr. Meera Kapoor" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Gender</label>
                  <select value={form.gender} onChange={(e) => {
                    const newGender = e.target.value as DoctorGender
                    const newShifts = newGender === "male"
                      ? form.allowed_shifts.filter((s) => s !== "obgyn")
                      : form.allowed_shifts
                    setForm({ ...form, gender: newGender, allowed_shifts: newShifts })
                  }} className="w-full rounded-lg border px-3 py-2 text-sm bg-background">
                    {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Weekly Off</label>
                  <select value={form.weekly_off} onChange={(e) => setForm({ ...form, weekly_off: e.target.value as Weekday })} className="w-full rounded-lg border px-3 py-2 text-sm bg-background">
                    {WEEKDAYS.map((w) => <option key={w} value={w}>{WEEKDAY_LABELS[w]}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Allowed Shifts</label>
                <div className="flex min-h-[2.625rem] flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  {form.allowed_shifts.length === 0 ? (
                    <span className="text-xs text-muted-foreground/60">Click shifts below to add...</span>
                  ) : form.allowed_shifts.map((shift) => (
                    <span key={shift} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${SHIFT_COLORS[shift] ?? "bg-muted text-muted-foreground"}`}>
                      {shift}
                      <button type="button" onClick={() => setForm({ ...form, allowed_shifts: form.allowed_shifts.filter((s) => s !== shift) })} className="hover:opacity-70">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {ALL_SHIFTS.map((shift) => {
                    const isObgyn = shift === "obgyn"
                    const isMale = form.gender === "male"
                    const disabled = isObgyn && isMale
                    const selected = form.allowed_shifts.includes(shift)
                    return (
                      <button
                        key={shift}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return
                          setForm({
                            ...form,
                            allowed_shifts: selected
                              ? form.allowed_shifts.filter((s) => s !== shift)
                              : [...form.allowed_shifts, shift],
                          })
                        }}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.688rem] font-medium transition-colors ${
                          disabled
                            ? "bg-gray-100 text-gray-300 cursor-not-allowed line-through"
                            : "bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
                        }`}
                      >
                        {shift}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm bg-background min-h-[3.75rem]" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button onClick={handleSave} disabled={saving} className="flex-1">{saving ? "Saving..." : editingId ? "Update" : "Create"}</Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the doctor. They will no longer appear in lists but their historical shifts are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => handleDelete(deleteTarget!.id, deleteTarget!.name)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export const Route = createFileRoute("/__mainLayout/doctors")({
  component: DoctorsPage,
})

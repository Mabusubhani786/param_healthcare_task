import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

import { getDoctors } from "@/das/doctor.das"
import { getShiftTypes as apiGetShiftTypes } from "@/lib/api"
import { getShiftAllocation, type ShiftAllocationData } from "@/das/shift.das"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const SHIFT_COLORS: Record<string, string> = {
  morning: "bg-amber-400 text-amber-950",
  day: "bg-sky-400 text-sky-950",
  night: "bg-indigo-500 text-white",
  afternoon: "bg-orange-400 text-orange-950",
  obgyn: "bg-emerald-400 text-emerald-950",
  off: "bg-gray-100 text-gray-500",
}

function getCellStyle(shiftTypeId: string | null): string {
  if (!shiftTypeId) return "bg-gray-50 text-gray-400"
  return SHIFT_COLORS[shiftTypeId] ?? "bg-purple-300 text-purple-950"
}

function getShiftAbbr(shiftTypeId: string | null): string {
  if (!shiftTypeId) return "—"
  return shiftTypeId.slice(0, 2).toUpperCase()
}

function ShiftsPage() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(6)
  const [data, setData] = useState<ShiftAllocationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const pageSize = 5

  const fetch = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const [docs, st] = await Promise.all([getDoctors(), apiGetShiftTypes()])
      const d = await getShiftAllocation(y, m, docs.doctors, st)
      setData(d)
    } catch {
      // toast handled upstream
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch(year, month) }, [year, month, fetch])

  const columns = data?.columns ?? []
  const rows = data?.rows ?? []
  const rosterMonth = data?.rosterMonth ?? null

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
    setPage(0)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
    setPage(0)
  }

  const totalAssignments = useMemo(() => {
    let count = 0
    if (data) {
      for (const row of data.rows) {
        for (const s of row.shifts) {
          if (s && s.assignment_date) count++
        }
      }
    }
    return count
  }, [data])

  const paginatedRows = data?.rows.slice(page * pageSize, (page + 1) * pageSize) ?? []
  const totalPages = data ? Math.ceil(data.rows.length / pageSize) : 0

  return (
    <div className="flex flex-1 flex-col h-0 gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Shifts</h2>
          <p className="text-sm text-muted-foreground">Monthly shift allocation view</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>&larr;</Button>
          <span className="text-sm font-semibold min-w-[9.375rem] text-center">{MONTHS[month - 1]} {year}</span>
          <Button variant="outline" size="sm" onClick={nextMonth}>&rarr;</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col gap-4 p-4">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !rosterMonth ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3 shrink-0">
          <CalendarDays className="size-10 opacity-40" />
          <p>No roster generated for this month yet.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground px-4 shrink-0">
            <span>Doctors: {rows.length}</span>
            <span>Total assignments: {totalAssignments}</span>
          </div>

          <div className="rounded-lg border bg-card flex-1 overflow-auto h-0">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b">
                    <th className="sticky left-0 bg-card z-20 px-3 py-2 text-left font-medium text-muted-foreground min-w-[8.75rem] border-r">Doctor</th>
                    {columns.map((col) => (
                      <th key={col.date} className={`px-1.5 py-2 text-center font-medium min-w-[2rem] ${
                        col.dayOfWeek === 0 ? "bg-red-50 text-red-600" : col.dayOfWeek === 6 ? "bg-amber-50" : ""
                      }`}>
                        <div>{col.date}</div>
                        <div className="text-[0.625rem] opacity-60">{col.dayLabel}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => (
                    <tr key={row.doctor.id} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="sticky left-0 bg-card z-10 px-3 py-1.5 font-medium text-xs border-r whitespace-nowrap">
                        <div>{row.doctor.name}</div>
                        <div className="text-[0.625rem] text-muted-foreground">Off: {row.doctor.weekly_off.slice(0, 3)}</div>
                      </td>
                      {row.shifts.map((shift, idx) => {
                        const isOff = new Date(year, month - 1, idx + 1).getDay() ===
                          ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
                            .indexOf(row.doctor.weekly_off)
                        return (
                          <td key={idx} className={`px-1.5 py-1.5 text-center ${isOff ? "bg-gray-50" : ""}`}>
                            <span className={`inline-block rounded px-1 py-0.5 text-[0.625rem] font-semibold leading-none ${getCellStyle(shift?.shift_type_id ?? null)}`}>
                              {shift ? getShiftAbbr(shift.shift_type_id) : isOff ? "OFF" : "—"}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>

          <div className="flex items-center justify-between shrink-0">
            <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => (
                <Button key={i} variant={page === i ? "default" : "ghost"} size="sm" className="min-w-[2rem]" onClick={() => setPage(i)}>
                  {i + 1}
                </Button>
              ))}
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export const Route = createFileRoute("/__mainLayout/shifts")({
  component: ShiftsPage,
})

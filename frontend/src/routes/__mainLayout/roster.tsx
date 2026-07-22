import { createFileRoute } from "@tanstack/react-router"
import { format, getDaysInMonth, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns"
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  getDoctorLeaves,
  getDoctors,
  getRosterAssignments,
  getRosterMonths,
  getShiftTypes,
  createRosterAssignment,
  updateRosterAssignment,
  deleteRosterAssignment,
  createRosterMonth,
} from "@/lib/api"
import type { Doctor, ShiftType, RosterAssignment, RosterMonth, DoctorLeave } from "@/types/roster.types"

const SHIFT_ORDER = ["morning", "day", "obgyn", "afternoon", "night"] as const
const SHIFT_LABELS: Record<string, string> = {
  morning: "Morning\n8AM-2PM",
  day: "Day\n10AM-6PM",
  obgyn: "OBGYN\n10AM-6PM",
  afternoon: "Afternoon\n2PM-8PM",
  night: "Night\n8PM-8AM",
}

const DOCTOR_COLORS = [
  "bg-blue-100 text-blue-800 border-blue-300",
  "bg-emerald-100 text-emerald-800 border-emerald-300",
  "bg-amber-100 text-amber-800 border-amber-300",
  "bg-violet-100 text-violet-800 border-violet-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-cyan-100 text-cyan-800 border-cyan-300",
]

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function useRosterState() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([])
  const [rosterMonth, setRosterMonth] = useState<RosterMonth | null>(null)
  const [assignments, setAssignments] = useState<RosterAssignment[]>([])
  const [leaves, setLeaves] = useState<DoctorLeave[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [generating, setGenerating] = useState(false)

  const daysInMonth = useMemo(() => getDaysInMonth(new Date(year, month - 1)), [year, month])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [docs, shifts, months, allLeaves] = await Promise.all([
        getDoctors(),
        getShiftTypes(),
        getRosterMonths({ year: String(year), month: String(month) }),
        getDoctorLeaves(),
      ])
      setDoctors(docs)
      setShiftTypes(shifts)

      const existing = months.find((m) => m.year === year && m.month === month)
      setRosterMonth(existing ?? null)

      if (existing) {
        const rosters = await getRosterAssignments({ roster_month_id: existing.id })
        setAssignments(rosters)
      } else {
        setAssignments([])
      }

      const monthLeaves = allLeaves.filter((l) => {
        const d = new Date(l.leave_date)
        return d.getFullYear() === year && d.getMonth() + 1 === month
      })
      setLeaves(monthLeaves)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchData() }, [fetchData])

  const goToMonth = (date: Date) => {
    setYear(date.getFullYear())
    setMonth(date.getMonth() + 1)
  }

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }

  const generateRoster = async () => {
    setGenerating(true)
    try {
      let rm = rosterMonth
      if (!rm) {
        rm = await createRosterMonth({ year, month })
        setRosterMonth(rm)
      }
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }

  const updateAssignment = async (
    date: number,
    shiftTypeId: string,
    doctorId: string | null,
    isManualOverride?: boolean,
    note?: string,
  ) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`
    const existing = assignments.find(
      (a) => a.assignment_date === dateStr && a.shift_type_id === shiftTypeId,
    )

    try {
      if (!rosterMonth) {
        const rm = await createRosterMonth({ year, month })
        setRosterMonth(rm)
      }
      const rmId = rosterMonth?.id ?? (await createRosterMonth({ year, month })).id

      if (existing) {
        if (doctorId === null) {
          await deleteRosterAssignment(existing.id)
        } else {
          await updateRosterAssignment(existing.id, {
            doctor_id: doctorId,
            is_manual_override: isManualOverride ?? true,
            source: "manual",
            override_note: note ?? null,
          } as Partial<RosterAssignment>)
        }
      } else if (doctorId !== null) {
        await createRosterAssignment({
          roster_month_id: rmId,
          assignment_date: dateStr,
          shift_type_id: shiftTypeId,
          doctor_id: doctorId,
          is_shift_active: true,
          source: "manual",
          is_manual_override: true,
          override_note: note ?? null,
        } as Partial<RosterAssignment>)
      }
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
    }
  }

  return {
    year, month, daysInMonth,
    doctors, shiftTypes, rosterMonth, assignments, leaves,
    loading, error, generating,
    prevMonth, nextMonth, goToMonth, generateRoster, updateAssignment, fetchData,
  }
}

function getDoctorColor(doctorId: string, doctors: Doctor[]): string {
  const idx = doctors.findIndex((d) => d.id === doctorId)
  return DOCTOR_COLORS[idx >= 0 ? idx % DOCTOR_COLORS.length : 0]
}

function getDoctorName(doctorId: string | null, doctors: Doctor[]): string {
  if (!doctorId) return ""
  const doc = doctors.find((d) => d.id === doctorId)
  return doc ? doc.name.replace("Dr. ", "") : ""
}

function getWeeksInMonth(year: number, month: number): { weekNumber: number; days: { date: number; dayOfWeek: number; isCurrentMonth: boolean }[] }[] {
  const monthStart = startOfMonth(new Date(year, month - 1))
  const monthEnd = endOfMonth(monthStart)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const allDays = eachDayOfInterval({ start: calStart, end: calEnd })

  const weeks: { weekNumber: number; days: { date: number; dayOfWeek: number; isCurrentMonth: boolean }[] }[] = []
  let currentWeek: { date: number; dayOfWeek: number; isCurrentMonth: boolean }[] = []
  let weekNum = 1

  allDays.forEach((day) => {
    const isCurrentMonth = day.getMonth() === month - 1
    currentWeek.push({
      date: day.getDate(),
      dayOfWeek: day.getDay(),
      isCurrentMonth,
    })
    if (currentWeek.length === 7) {
      weeks.push({ weekNumber: weekNum++, days: currentWeek })
      currentWeek = []
    }
  })

  return weeks
}

function RosterPage() {
  const state = useRosterState()
  const [editing, setEditing] = useState<{ date: number; shiftTypeId: string } | null>(null)
  const [editDoctorId, setEditDoctorId] = useState("")
  const [editNote, setEditNote] = useState("")
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [currentWeekIdx, setCurrentWeekIdx] = useState(0)

  const weeks = useMemo(() => getWeeksInMonth(state.year, state.month), [state.year, state.month])

  useEffect(() => { setCurrentWeekIdx(0) }, [state.year, state.month])

  const openEditor = (date: number, shiftTypeId: string) => {
    const dateStr = `${state.year}-${String(state.month).padStart(2, "0")}-${String(date).padStart(2, "0")}`
    const existing = state.assignments.find(
      (a) => a.assignment_date === dateStr && a.shift_type_id === shiftTypeId,
    )
    setEditing({ date, shiftTypeId })
    setEditDoctorId(existing?.doctor_id ?? "")
    setEditNote(existing?.override_note ?? "")
  }

  const saveEdit = () => {
    if (!editing) return
    state.updateAssignment(editing.date, editing.shiftTypeId, editDoctorId || null, true, editNote || undefined)
    setEditing(null)
  }

  const clearAssignment = () => {
    if (!editing) return
    state.updateAssignment(editing.date, editing.shiftTypeId, null)
    setEditing(null)
  }

  const getAssignment = (date: number, shiftTypeId: string) => {
    const dateStr = `${state.year}-${String(state.month).padStart(2, "0")}-${String(date).padStart(2, "0")}`
    return state.assignments.find(
      (a) => a.assignment_date === dateStr && a.shift_type_id === shiftTypeId,
    )
  }

  const getLeavesForDate = (date: number) => {
    const dateStr = `${state.year}-${String(state.month).padStart(2, "0")}-${String(date).padStart(2, "0")}`
    return state.leaves.filter((l) => l.leave_date === dateStr)
  }

  const editDateStr = editing
    ? `${state.year}-${String(state.month).padStart(2, "0")}-${String(editing.date).padStart(2, "0")}`
    : ""
  const editAssignment = editing ? getAssignment(editing.date, editing.shiftTypeId) : null
  const editShiftType = state.shiftTypes.find((st) => st.id === editing?.shiftTypeId)
  const eligibleDoctors = editing
    ? state.doctors.filter((d) => {
        if (editShiftType?.female_only && d.gender !== "female") return false
        return true
      })
    : state.doctors

  const isUnavailable = (date: number, doctorId: string): string | null => {
    const dateStr = `${state.year}-${String(state.month).padStart(2, "0")}-${String(date).padStart(2, "0")}`
    const doc = state.doctors.find((d) => d.id === doctorId)
    if (!doc) return null
    const leave = state.leaves.find((l) => l.leave_date === dateStr && l.doctor_id === doctorId)
    if (leave) return "On leave"
    const dayOfWeek = new Date(state.year, state.month - 1, date).getDay()
    const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    if (doc.weekly_off === weekdayNames[dayOfWeek]) return "Weekly off"
    return null
  }

  const currentMonthDate = new Date(state.year, state.month - 1, 1)
  const currentWeek = weeks[currentWeekIdx]
  const hasPrev = currentWeekIdx > 0
  const hasNext = currentWeekIdx < weeks.length - 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={state.prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="text-2xl font-bold h-auto px-3 min-w-40">
                {format(currentMonthDate, "MMMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={currentMonthDate}
                onSelect={(date) => {
                  if (date) {
                    state.goToMonth(date)
                    setCalendarOpen(false)
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={state.nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {state.rosterMonth?.generated_at && (
            <span className="text-xs text-muted-foreground">
              Generated: {new Date(state.rosterMonth.generated_at).toLocaleDateString()}
            </span>
          )}
          <Button onClick={state.generateRoster} disabled={state.generating}>
            <RotateCcw className={`size-4 mr-2 ${state.generating ? "animate-spin" : ""}`} />
            {state.generating ? "Generating..." : "Generate Roster"}
          </Button>
        </div>
      </div>

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state.loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Loading roster data...
        </div>
      ) : currentWeek ? (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between bg-muted/50 px-4 py-2 border-b">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setCurrentWeekIdx((i) => i - 1)}>
              <ChevronLeft className="size-4 mr-1" /> Previous Week
            </Button>
            <h3 className="text-sm font-semibold text-foreground">
              Week {currentWeek.weekNumber} of {weeks.length}
            </h3>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setCurrentWeekIdx((i) => i + 1)}>
              Next Week <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] table-fixed border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-28 bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground border-b border-r">
                    Shift
                  </th>
                  {currentWeek.days.map((d, i) => {
                    const dt = new Date(state.year, state.month - 1, d.date)
                    return (
                      <th
                        key={i}
                        className={`px-1 py-2 text-center text-xs font-medium border-b ${
                          !d.isCurrentMonth ? "opacity-30" : dt.getDay() === 0 || dt.getDay() === 6 ? "bg-red-50/50" : "bg-muted"
                        }`}
                      >
                        <div className="text-muted-foreground">{WEEKDAYS[d.dayOfWeek]}</div>
                        <div className="text-sm font-semibold text-foreground">{d.isCurrentMonth ? d.date : ""}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {SHIFT_ORDER.map((shiftId) => {
                  const shift = state.shiftTypes.find((s) => s.id === shiftId)
                  if (!shift) return null
                  const label = SHIFT_LABELS[shiftId] ?? shift.name
                  const lines = label.split("\n")
                  return (
                    <tr key={shiftId}>
                      <td className="bg-card px-3 py-2 text-xs font-medium text-foreground border-b border-r whitespace-pre-line">
                        <div>{lines[0]}</div>
                        {lines[1] && <div className="text-[10px] text-muted-foreground">{lines[1]}</div>}
                        {shift.female_only && (
                          <div className="text-[10px] text-rose-500 font-semibold mt-0.5">Female only</div>
                        )}
                      </td>
                      {currentWeek.days.map((d, i) => {
                        if (!d.isCurrentMonth) {
                          return <td key={i} className="border-b border-r bg-muted/10" />
                        }
                        const assignment = getAssignment(d.date, shiftId)
                        const docName = getDoctorName(assignment?.doctor_id ?? null, state.doctors)
                        const isManual = assignment?.is_manual_override
                        const isInactive = assignment?.is_shift_active === false
                        const leavesOnDay = getLeavesForDate(d.date)
                        const dt = new Date(state.year, state.month - 1, d.date)
                        const isWeekend = dt.getDay() === 0 || dt.getDay() === 6

                        return (
                          <td
                            key={i}
                            onClick={() => openEditor(d.date, shiftId)}
                            className={`px-1 py-2 text-center border-b border-r cursor-pointer transition-colors hover:bg-accent/50 ${
                              isWeekend ? "bg-red-50/30" : ""
                            }`}
                          >
                            {isInactive ? (
                              <span className="text-[11px] text-muted-foreground line-through">Inactive</span>
                            ) : docName ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span
                                  className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium border ${
                                    getDoctorColor(assignment!.doctor_id!, state.doctors)
                                  } ${isManual ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
                                >
                                  {docName}
                                </span>
                                {isManual && (
                                  <span className="text-[9px] text-amber-600 font-medium">Manual</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                            {leavesOnDay.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-0.5 justify-center">
                                {leavesOnDay.map((lv) => {
                                  const n = getDoctorName(lv.doctor_id, state.doctors)
                                  return (
                                    <span
                                      key={lv.id}
                                      className="inline-block rounded-sm bg-orange-100 px-1 py-0.5 text-[9px] text-orange-700 border border-orange-200"
                                    >
                                      {n} (leave)
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {state.doctors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.doctors.map((doc, idx) => (
            <span
              key={doc.id}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${DOCTOR_COLORS[idx % DOCTOR_COLORS.length]}`}
            >
              <span>{doc.name}</span>
              <span className="text-[10px] opacity-70">({doc.weekly_off} off)</span>
            </span>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1">
              {editShiftType?.name} — {editDateStr}
            </h3>
            {editAssignment?.is_manual_override && (
              <p className="text-xs text-amber-600 mb-3">Manual override — will not be overwritten by generation</p>
            )}

            <label className="block text-xs font-medium text-muted-foreground mb-1">Assign doctor</label>
            <select
              value={editDoctorId}
              onChange={(e) => setEditDoctorId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background mb-3"
            >
              <option value="">— Unassign —</option>
              {eligibleDoctors.map((doc) => {
                const reason = editing ? isUnavailable(editing.date, doc.id) : null
                return (
                  <option key={doc.id} value={doc.id} disabled={reason !== null}>
                    {doc.name}{reason ? ` (${reason})` : ""}
                  </option>
                )
              })}
            </select>

            <label className="block text-xs font-medium text-muted-foreground mb-1">Note (optional)</label>
            <input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="e.g. Swapped with Dr. X"
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background mb-4"
            />

            <div className="flex gap-2">
              <Button onClick={saveEdit} className="flex-1">Save</Button>
              <Button variant="outline" onClick={clearAssignment}>Clear</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute("/__mainLayout/roster")({
  component: RosterPage,
})
import { createFileRoute } from "@tanstack/react-router"
import { format, getDaysInMonth, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns"
import { ChevronLeft, ChevronRight, RotateCcw, AlertTriangle } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getDoctorLeaves,
  getDoctors,
  getRosterAssignments,
  getRosterMonths,
  getShiftTypes,
  generateRosterAPI,
  manualAssignAPI,
  validateAssignmentAPI,
} from "@/lib/api"
import { toast } from "@/lib/toast"
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

function useRosterState() {
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(6)

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
      setDoctors(docs.data)
      setShiftTypes(shifts)

      const existing = months.find((m) => m.year === year && m.month === month)
      setRosterMonth(existing ?? null)

      if (existing) {
        const rosters = await getRosterAssignments({ roster_month_id: existing.id })
        setAssignments(rosters)
      } else {
        setAssignments([])
      }

      const monthLeaves = allLeaves.data.filter((l) => {
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

  const generateRoster = async (overwriteManual = false) => {
    setGenerating(true)
    setError("")
    try {
      const result = await generateRosterAPI(year, month, overwriteManual)

      setRosterMonth(result.rosterMonth)
      await fetchData()

      if (result.warnings.length > 0) {
        toast({
          title: "Roster generated with warnings",
          description: result.warnings.slice(0, 5).join("\n"),
          variant: "warning",
        })
      } else {
        toast({
          title: "Roster generated successfully",
          description: `${result.assignmentsCreated} assignments created, ${result.assignmentsSkipped} manual overrides preserved.`,
          variant: "success",
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      })
    } finally {
      setGenerating(false)
    }
  }

  const updateAssignment = async (
    date: number,
    shiftTypeId: string,
    doctorId: string | null,
    _isManualOverride?: boolean,
    note?: string,
    isShiftActive?: boolean,
  ) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`

    try {
      if (!rosterMonth) {
        toast({
          title: "Generate roster first",
          description: "Please generate a roster for this month before making manual edits.",
          variant: "error",
        })
        return
      }

      const result = await manualAssignAPI({
        rosterMonthId: rosterMonth.id,
        assignmentDate: dateStr,
        shiftTypeId,
        doctorId,
        isShiftActive,
        overrideNote: note,
      })

      // Show validation warnings
      if (result.validationWarnings.length > 0) {
        const hasHard = result.hasHardErrors
        toast({
          title: hasHard ? "Rule violation detected" : "Scheduling warning",
          description: result.validationWarnings.join("\n"),
          variant: hasHard ? "error" : "warning",
        })
      } else if (doctorId) {
        toast({
          title: "Assignment saved",
          variant: "success",
        })
      } else {
        toast({
          title: "Slot cleared",
          variant: "success",
        })
      }

      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      })
    }
  }

  const validateEdit = async (
    date: number,
    shiftTypeId: string,
    doctorId: string | null,
  ): Promise<string[]> => {
    if (!rosterMonth || !doctorId) return []
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`
    try {
      const result = await validateAssignmentAPI({
        rosterMonthId: rosterMonth.id,
        assignmentDate: dateStr,
        shiftTypeId,
        doctorId,
      })
      return result.warnings
    } catch {
      return []
    }
  }

  return {
    year, month, daysInMonth,
    doctors, shiftTypes, rosterMonth, assignments, leaves,
    loading, error, generating,
    prevMonth, nextMonth, goToMonth, generateRoster, updateAssignment, validateEdit, fetchData,
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
  const [editIsShiftActive, setEditIsShiftActive] = useState(true)
  const [editWarnings, setEditWarnings] = useState<string[]>([])
  const [editConfirming, setEditConfirming] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [currentWeekIdx, setCurrentWeekIdx] = useState(0)
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)

  const weeks = useMemo(() => getWeeksInMonth(state.year, state.month), [state.year, state.month])

  // Reset week index on month change
  const prevKey = `${state.year}-${state.month}`
  const [prevMonthKey, setPrevMonthKey] = useState(prevKey)
  if (prevMonthKey !== prevKey) {
    setCurrentWeekIdx(0)
    setPrevMonthKey(prevKey)
  }

  const openEditor = (date: number, shiftTypeId: string) => {
    const dateStr = `${state.year}-${String(state.month).padStart(2, "0")}-${String(date).padStart(2, "0")}`
    const existing = state.assignments.find(
      (a) => a.assignment_date === dateStr && a.shift_type_id === shiftTypeId,
    )
    setEditing({ date, shiftTypeId })
    setEditDoctorId(existing?.doctor_id ?? "")
    setEditNote(existing?.override_note ?? "")
    setEditIsShiftActive(existing?.is_shift_active ?? true)
    setEditWarnings([])
    setEditConfirming(false)
  }

  const saveEdit = async () => {
    if (!editing) return
    const docId = editDoctorId || null

    if (!editConfirming && docId) {
      const warnings = await state.validateEdit(editing.date, editing.shiftTypeId, docId)
      if (warnings.length > 0) {
        setEditWarnings(warnings)
        setEditConfirming(true)
        return
      }
    }

    state.updateAssignment(editing.date, editing.shiftTypeId, docId, true, editNote || undefined, editIsShiftActive)
    setEditing(null)
    setEditConfirming(false)
    setEditWarnings([])
  }

  const clearAssignment = () => {
    if (!editing) return
    state.updateAssignment(editing.date, editing.shiftTypeId, null)
    setEditing(null)
    setEditConfirming(false)
    setEditWarnings([])
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

  const handleGenerateClick = () => {
    const hasManualOverrides = state.assignments.some((a) => a.is_manual_override)
    if (hasManualOverrides && !showOverwriteConfirm) {
      setShowOverwriteConfirm(true)
      return
    }
    setShowOverwriteConfirm(false)
    state.generateRoster(!hasManualOverrides)
  }

  const currentMonthDate = new Date(state.year, state.month - 1, 1)
  const currentWeek = weeks[currentWeekIdx]
  const hasPrev = currentWeekIdx > 0
  const hasNext = currentWeekIdx < weeks.length - 1
  const manualCount = state.assignments.filter((a) => a.is_manual_override).length

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
          {manualCount > 0 && (
            <span className="text-xs text-amber-600 font-medium">
              {manualCount} manual override{manualCount !== 1 ? "s" : ""}
            </span>
          )}
          {showOverwriteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="size-3" />
                Overwrite manual overrides?
              </span>
              <Button size="sm" variant="destructive" onClick={() => state.generateRoster(true)}>
                Yes, Overwrite All
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                state.generateRoster(false)
                setShowOverwriteConfirm(false)
              }}>
                Keep Overrides
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowOverwriteConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button onClick={handleGenerateClick} disabled={state.generating}>
              <RotateCcw className={`size-4 mr-2 ${state.generating ? "animate-spin" : ""}`} />
              {state.generating ? "Generating..." : "Generate Roster"}
            </Button>
          )}
        </div>
      </div>

      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state.loading ? (
        <div className="flex flex-1 flex-col gap-4 py-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
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
            <table className="w-full min-w-[37.5rem] table-fixed border-collapse text-sm">
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
                        {lines[1] && <div className="text-[0.625rem] text-muted-foreground">{lines[1]}</div>}
                        {shift.female_only && (
                          <div className="text-[0.625rem] text-rose-500 font-semibold mt-0.5">Female only</div>
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
                              <span className="text-[0.688rem] text-muted-foreground line-through">Inactive</span>
                            ) : docName ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span
                                  className={`inline-block rounded px-1.5 py-0.5 text-[0.688rem] font-medium border ${
                                    getDoctorColor(assignment!.doctor_id!, state.doctors)
                                  } ${isManual ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
                                >
                                  {docName}
                                </span>
                                {isManual && (
                                  <span className="text-[0.563rem] text-amber-600 font-medium">Manual</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[0.688rem] text-muted-foreground">—</span>
                            )}
                            {leavesOnDay.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-0.5 justify-center">
                                {leavesOnDay.map((lv) => {
                                  const n = getDoctorName(lv.doctor_id, state.doctors)
                                  return (
                                    <span
                                      key={lv.id}
                                      className="inline-block rounded-sm bg-orange-100 px-1 py-0.5 text-[0.563rem] text-orange-700 border border-orange-200"
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
              <span className="text-[0.625rem] opacity-70">({doc.weekly_off} off)</span>
            </span>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setEditing(null); setEditConfirming(false); setEditWarnings([]) }}>
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-1">
              {editShiftType?.name} — {editDateStr}
            </h3>
            {editAssignment?.is_manual_override && (
              <p className="text-xs text-amber-600 mb-3">Manual override — will not be overwritten by re-generation</p>
            )}

            {editConfirming && editWarnings.length > 0 && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Scheduling rule violation{editWarnings.length > 1 ? "s" : ""}:</p>
                <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
                  {editWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
                <p className="text-xs text-red-500 mt-2">You can still override by adding a note below.</p>
              </div>
            )}

            <label className="block text-xs font-medium text-muted-foreground mb-1">Assign doctor</label>
            <select
              value={editDoctorId}
              onChange={(e) => { setEditDoctorId(e.target.value); setEditWarnings([]); setEditConfirming(false) }}
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

            {editDoctorId && (
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIsShiftActive}
                  onChange={(e) => setEditIsShiftActive(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-xs text-muted-foreground">Mark shift as active</span>
              </label>
            )}

            <label className="block text-xs font-medium text-muted-foreground mb-1">Note (optional)</label>
            <input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder={editConfirming ? "e.g. Override approved by admin" : "e.g. Swapped with Dr. X"}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background mb-4"
            />

            <div className="flex gap-2">
              {editConfirming ? (
                <>
                  <Button onClick={saveEdit} className="flex-1" variant="destructive">Override Anyway</Button>
                  <Button variant="outline" onClick={() => { setEditing(null); setEditConfirming(false); setEditWarnings([]) }}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button onClick={saveEdit} className="flex-1">Save</Button>
                  <Button variant="outline" onClick={clearAssignment}>Clear</Button>
                  <Button variant="ghost" onClick={() => { setEditing(null); setEditWarnings([]) }}>Cancel</Button>
                </>
              )}
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

import {
  getRosterAssignments as apiGetAssignments,
  getRosterMonths as apiGetRosterMonths,
} from "@/lib/api"
import type {
  RosterAssignment,
  RosterMonth,
  Doctor,
  ShiftType,
  ShiftTypeId,
} from "@/types/roster.types"
import { getDaysInMonth } from "date-fns"

export interface DoctorShiftRow {
  doctor: Doctor
  shifts: (RosterAssignment | null)[]  // index = day-1
}

export interface DayColumn {
  date: number
  dayOfWeek: number
  dayLabel: string
}

export interface ShiftAllocationData {
  rosterMonth: RosterMonth | null
  month: number
  year: number
  daysInMonth: number
  columns: DayColumn[]
  rows: DoctorShiftRow[]
  shiftTypes: ShiftType[]
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export async function getShiftAllocation(
  year: number,
  month: number,
  doctors: Doctor[],
  shiftTypes: ShiftType[],
): Promise<ShiftAllocationData> {
  const months = await apiGetRosterMonths({ year: String(year), month: String(month) })
  const rosterMonth = months.find((m) => m.year === year && m.month === month) ?? null

  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const columns: DayColumn[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d)
    columns.push({
      date: d,
      dayOfWeek: dt.getDay(),
      dayLabel: WEEKDAY_SHORT[dt.getDay()] ?? "",
    })
  }

  const assignments: RosterAssignment[] = rosterMonth
    ? await apiGetAssignments({ roster_month_id: rosterMonth.id })
    : []

  const assignMap = new Map<string, RosterAssignment>()
  for (const a of assignments) {
    const key = `${a.assignment_date}|${a.shift_type_id}`
    assignMap.set(key, a)
  }

  const rows: DoctorShiftRow[] = doctors.map((doc) => {
    const shifts: (RosterAssignment | null)[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      // Find the assignment for this doctor on this day (any shift)
      for (const [, a] of assignMap) {
        if (a.assignment_date === dateStr && a.doctor_id === doc.id) {
          shifts.push(a)
          break
        }
      }
      if (shifts.length < d) {
        shifts.push(null)
      }
    }
    return { doctor: doc, shifts }
  })

  return {
    rosterMonth,
    year,
    month,
    daysInMonth,
    columns,
    rows,
    shiftTypes,
  }
}

export function getShiftLabel(shiftTypeId: ShiftTypeId, shiftTypes: ShiftType[]): string {
  const st = shiftTypes.find((s) => s.id === shiftTypeId)
  return st?.name ?? shiftTypeId
}

export function getDoctorTotalShifts(doctorId: string, rows: DoctorShiftRow[]): number {
  const row = rows.find((r) => r.doctor.id === doctorId)
  if (!row) return 0
  return row.shifts.filter((s) => s !== null && s.doctor_id !== null).length
}

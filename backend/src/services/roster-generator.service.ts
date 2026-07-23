import type {
  Doctor,
  ShiftType,
  RosterAssignment,
  DoctorLeave,
  SchedulingContext,
  ShiftTypeId,
  Weekday,
  AssignmentResult,
} from "@/types/roster.types.ts";

import {
  POST_NIGHT_RECOVERY_EXEMPT_SLUGS,
  OBGYN_ELIGIBLE_SLUGS,
  NIGHT_DISTRIBUTION_SLUGS,
  ROHAN_SLUG,
  IMRAN_SLUG,
  MAX_SHIFTS_PER_WEEK,
} from "@/types/roster.types.ts";

const WEEKDAY_NAMES: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function getWeekdayName(dow: number): Weekday {
  return WEEKDAY_NAMES[dow] ?? "sunday";
}

function makeDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getIsoWeekKey(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  return `${d.getFullYear()}-W${getWeekNumber(d)}`;
}

function parseDate(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const parts = dateKey.split("-").map(Number);
  return { year: parts[0] ?? 2026, month: parts[1] ?? 1, day: parts[2] ?? 1 };
}

function getPrevDateStr(dateKey: string): string {
  const { year, month, day } = parseDate(dateKey);
  const dt = new Date(year, month - 1, day);
  dt.setDate(dt.getDate() - 1);
  return makeDateStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

interface DayState {
  date: string;
  dayOfWeek: number;
  weekdayName: Weekday;
  assignments: Map<ShiftTypeId, AssignmentResult>;
  doctorShiftsThisDay: Set<string>;
}

interface DoctorState {
  doctor: Doctor;
  nightsThisMonth: number;
  shiftsThisWeek: number;
  consecutiveNights: number;
  lastNightDate: string | null;
  weeklyOffDates: Set<string>;
  leaveDates: Set<string>;
}

export function buildSchedulingContext(
  year: number,
  month: number,
  doctors: Doctor[],
  shiftTypes: ShiftType[],
  leaves: DoctorLeave[],
  existingAssignments: RosterAssignment[],
  overwriteManual: boolean
): SchedulingContext {
  const days = getDaysInMonth(year, month);

  const leavesMap = new Map<string, Set<string>>();
  for (const leave of leaves) {
    const set = leavesMap.get(leave.doctor_id) ?? new Set<string>();
    set.add(leave.leave_date);
    leavesMap.set(leave.doctor_id, set);
  }

  const weeklyOffDatesMap = new Map<string, Set<string>>();
  for (const doc of doctors) {
    const offDates = new Set<string>();
    for (let d = 1; d <= days; d++) {
      const dt = new Date(year, month - 1, d);
      if (getWeekdayName(dt.getDay()) === doc.weekly_off) {
        offDates.add(makeDateStr(year, month, d));
      }
    }
    weeklyOffDatesMap.set(doc.id, offDates);
  }

  const existingMap = new Map<string, RosterAssignment[]>();
  const manualOverrides = new Set<string>();

  for (const a of existingAssignments) {
    const list = existingMap.get(a.assignment_date) ?? [];
    list.push(a);
    existingMap.set(a.assignment_date, list);

    if (a.is_manual_override && !overwriteManual) {
      manualOverrides.add(`${a.assignment_date}|${a.shift_type_id}`);
    }
  }

  return {
    year,
    month,
    daysInMonth: days,
    doctors,
    shiftTypes,
    leaves: leavesMap,
    existingAssignments: existingMap,
    manualOverrides,
    weeklyOffDates: weeklyOffDatesMap,
  };
}

function isRecoveryExempt(doc: Doctor): boolean {
  return POST_NIGHT_RECOVERY_EXEMPT_SLUGS.includes(doc.slug as never);
}

function isOnRecoveryBlock(docState: DoctorState, date: string): boolean {
  if (isRecoveryExempt(docState.doctor)) return false;
  const prevDate = getPrevDateStr(date);
  return docState.lastNightDate === prevDate;
}

function getAvailableDoctors(
  ctx: SchedulingContext,
  doctorStates: Map<string, DoctorState>,
  day: DayState,
  shiftId: ShiftTypeId,
  shiftType: ShiftType
): Doctor[] {
  const available: Doctor[] = [];
  const prevDate = getPrevDateStr(day.date);

  for (const doc of ctx.doctors) {
    const docState = doctorStates.get(doc.id);
    if (!docState) continue;

    if (!doc.allowed_shifts.includes(shiftId)) continue;
    if (shiftType.female_only && doc.gender !== "female") continue;
    if (day.doctorShiftsThisDay.has(doc.id)) continue;
    if (docState.leaveDates.has(day.date)) continue;
    if (docState.weeklyOffDates.has(day.date)) continue;
    if (docState.shiftsThisWeek >= MAX_SHIFTS_PER_WEEK) continue;
    if (day.assignments.has(shiftId)) continue;

    if (isOnRecoveryBlock(docState, day.date) && shiftId !== "afternoon")
      continue;

    if (shiftId === "night") {
      const maxNights = doc.max_nights_per_month ?? Infinity;
      if (docState.nightsThisMonth >= maxNights) continue;
      if (doc.slug !== ROHAN_SLUG && docState.consecutiveNights > 0) continue;
    }

    available.push(doc);
  }

  return available;
}

function countShiftsInWeekForDoctor(
  allDayStates: DayState[],
  currentDayIdx: number,
  shiftType: ShiftTypeId,
  doctorId: string,
  year: number,
  month: number
): number {
  const currentDay = allDayStates[currentDayIdx];
  if (!currentDay) return 0;
  const dayNum = parseInt(currentDay.date.split("-")[2] ?? "1", 10);
  const weekKey = getIsoWeekKey(year, month, dayNum);
  let count = 0;

  for (let i = 0; i <= currentDayIdx; i++) {
    const ds = allDayStates[i];
    if (!ds) continue;
    const dk = parseInt(ds.date.split("-")[2] ?? "1", 10);
    const dsWeekKey = getIsoWeekKey(year, month, dk);
    if (dsWeekKey === weekKey) {
      const a = ds.assignments.get(shiftType);
      if (a?.doctorId === doctorId) count++;
    }
  }
  return count;
}

function pickBestDoctorForNight(
  candidates: Doctor[],
  doctorStates: Map<string, DoctorState>,
  nightDistributionCounts: Map<string, number>
): Doctor | null {
  if (candidates.length === 0) return null;

  // First pass: prefer doctors from the night distribution pool
  const poolCandidates = candidates.filter((d) =>
    NIGHT_DISTRIBUTION_SLUGS.includes(d.slug as never)
  );
  if (poolCandidates.length > 0) {
    const sorted = [...poolCandidates].sort((a, b) => {
      const aDist = nightDistributionCounts.get(a.id) ?? 0;
      const bDist = nightDistributionCounts.get(b.id) ?? 0;
      if (aDist !== bDist) return aDist - bDist;
      const aState = doctorStates.get(a.id);
      const bState = doctorStates.get(b.id);
      const aNights = aState?.nightsThisMonth ?? 0;
      const bNights = bState?.nightsThisMonth ?? 0;
      if (aNights !== bNights) return aNights - bNights;
      return a.name.localeCompare(b.name);
    });
    return sorted[0] ?? null;
  }

  // Fallback: any other eligible doctor (Imran, etc.)
  const sorted = [...candidates].sort((a, b) => {
    const aState = doctorStates.get(a.id);
    const bState = doctorStates.get(b.id);
    const aNights = aState?.nightsThisMonth ?? 0;
    const bNights = bState?.nightsThisMonth ?? 0;
    if (aNights !== bNights) return aNights - bNights;
    return a.name.localeCompare(b.name);
  });
  return sorted[0] ?? null;
}

function pickBestDoctorForObgyn(
  candidates: Doctor[],
  obgynDistributionCounts: Map<string, number>
): Doctor | null {
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const aDist = obgynDistributionCounts.get(a.id) ?? 0;
    const bDist = obgynDistributionCounts.get(b.id) ?? 0;
    if (aDist !== bDist) return aDist - bDist;
    return a.name.localeCompare(b.name);
  });

  return sorted[0] ?? null;
}

function pickDoctorForOtherShift(
  candidates: Doctor[],
  doctorStates: Map<string, DoctorState>
): Doctor | null {
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const aState = doctorStates.get(a.id);
    const bState = doctorStates.get(b.id);
    const aShifts = aState?.shiftsThisWeek ?? 0;
    const bShifts = bState?.shiftsThisWeek ?? 0;
    if (aShifts !== bShifts) return aShifts - bShifts;
    return a.name.localeCompare(b.name);
  });

  return sorted[0] ?? null;
}

function shouldDropShiftsForDay(
  day: DayState,
  ctx: SchedulingContext,
  doctorStates: Map<string, DoctorState>,
  manualAssignmentsMap: Map<string, AssignmentResult>
): { dropObgyn: boolean; dropDay: boolean; warnings: string[] } {
  const result = { dropObgyn: false, dropDay: false, warnings: [] as string[] };

  let unavailableCount = 0;
  for (const doc of ctx.doctors) {
    const docState = doctorStates.get(doc.id);
    if (!docState) {
      unavailableCount++;
      continue;
    }
    if (docState.weeklyOffDates.has(day.date)) {
      unavailableCount++;
      continue;
    }
    if (docState.leaveDates.has(day.date)) {
      unavailableCount++;
      continue;
    }
    if (isOnRecoveryBlock(docState, day.date)) {
      unavailableCount++;
      continue;
    }
    if (docState.shiftsThisWeek >= MAX_SHIFTS_PER_WEEK) {
      unavailableCount++;
      continue;
    }
    if (doc.slug !== ROHAN_SLUG && docState.consecutiveNights > 0) {
      unavailableCount++;
      continue;
    }
    // Same-day conflict from manual overrides only (loaded before main assignment loop)
    if (day.doctorShiftsThisDay.has(doc.id)) {
      unavailableCount++;
      continue;
    }
  }

  if (unavailableCount >= 2) {
    result.dropObgyn = true;
    result.warnings.push(
      `${day.date}: OBGYN shift dropped (${unavailableCount} doctors unavailable)`
    );
  }
  if (unavailableCount >= 3) {
    result.dropDay = true;
    result.warnings.push(
      `${day.date}: Day shift dropped (${unavailableCount} doctors unavailable)`
    );
  }

  return result;
}

export function generateRoster(ctx: SchedulingContext): {
  assignments: AssignmentResult[];
  warnings: string[];
} {
  const allAssignments: AssignmentResult[] = [];
  const warnings: string[] = [];

  const doctorStates = new Map<string, DoctorState>();
  for (const doc of ctx.doctors) {
    doctorStates.set(doc.id, {
      doctor: doc,
      nightsThisMonth: 0,
      shiftsThisWeek: 0,
      consecutiveNights: 0,
      lastNightDate: null,
      weeklyOffDates: ctx.weeklyOffDates.get(doc.id) ?? new Set(),
      leaveDates: ctx.leaves.get(doc.id) ?? new Set(),
    });
  }

  const allDayStates: DayState[] = [];
  for (let d = 1; d <= ctx.daysInMonth; d++) {
    const ds = makeDateStr(ctx.year, ctx.month, d);
    const dt = new Date(ctx.year, ctx.month - 1, d);
    allDayStates.push({
      date: ds,
      dayOfWeek: dt.getDay(),
      weekdayName: getWeekdayName(dt.getDay()),
      assignments: new Map(),
      doctorShiftsThisDay: new Set(),
    });
  }

  // Preserve manual overrides
  const manualAssignmentsMap = new Map<string, AssignmentResult>();
  for (const [dateKey, dayAssignments] of ctx.existingAssignments) {
    for (const a of dayAssignments) {
      const key = `${dateKey}|${a.shift_type_id}`;
      if (a.is_manual_override && ctx.manualOverrides.has(key)) {
        const result: AssignmentResult = {
          date: dateKey,
          shiftTypeId: a.shift_type_id,
          doctorId: a.doctor_id,
          source: "manual",
          isManualOverride: true,
          warnings: [],
        };
        manualAssignmentsMap.set(key, result);

        const dayState = allDayStates.find((ds) => ds.date === dateKey);
        if (dayState) {
          dayState.assignments.set(a.shift_type_id, result);
          if (a.doctor_id) {
            dayState.doctorShiftsThisDay.add(a.doctor_id);
            const docState = doctorStates.get(a.doctor_id);
            if (docState) {
              if (a.shift_type_id === "night") {
                docState.nightsThisMonth++;
                docState.lastNightDate = dateKey;
                docState.consecutiveNights++;
              }
              docState.shiftsThisWeek++;
            }
          }
        }
      }
    }
  }

  if (allDayStates.length > 0) {
    const firstDayNum = parseInt(
      allDayStates[0]!.date.split("-")[2] ?? "1",
      10
    );
    const firstWeekKey = getIsoWeekKey(ctx.year, ctx.month, firstDayNum);
    for (const docState of doctorStates.values()) {
      let count = 0;
      for (const [key, ma] of manualAssignmentsMap) {
        if (ma.doctorId !== docState.doctor.id) continue;
        const datePart = key.split("|")[0] ?? "";
        const dayNum = parseInt(datePart.split("-")[2] ?? "1", 10);
        if (getIsoWeekKey(ctx.year, ctx.month, dayNum) === firstWeekKey)
          count++;
      }
      docState.shiftsThisWeek = count;
    }
  }

  // Distribution counters
  const nightDistributionCounts = new Map<string, number>();
  for (const slug of NIGHT_DISTRIBUTION_SLUGS) {
    const doc = ctx.doctors.find((d) => d.slug === slug);
    if (doc) nightDistributionCounts.set(doc.id, 0);
  }

  const obgynDistributionCounts = new Map<string, number>();
  for (const slug of OBGYN_ELIGIBLE_SLUGS) {
    const doc = ctx.doctors.find((d) => d.slug === slug);
    if (doc) obgynDistributionCounts.set(doc.id, 0);
  }

  // Update distribution counts from manual overrides
  for (const a of manualAssignmentsMap.values()) {
    if (a.shiftTypeId === "night" && a.doctorId) {
      const doc = ctx.doctors.find((d) => d.id === a.doctorId);
      if (doc && NIGHT_DISTRIBUTION_SLUGS.includes(doc.slug as never)) {
        nightDistributionCounts.set(
          doc.id,
          (nightDistributionCounts.get(doc.id) ?? 0) + 1
        );
      }
    }
    if (a.shiftTypeId === "obgyn" && a.doctorId) {
      const doc = ctx.doctors.find((d) => d.id === a.doctorId);
      if (doc && OBGYN_ELIGIBLE_SLUGS.includes(doc.slug as never)) {
        obgynDistributionCounts.set(
          doc.id,
          (obgynDistributionCounts.get(doc.id) ?? 0) + 1
        );
      }
    }
  }

  const rohanDoc = ctx.doctors.find((d) => d.slug === ROHAN_SLUG);
  const rohanDocId = rohanDoc?.id;

  const shiftsToAssign: ShiftTypeId[] = [
    "night",
    "morning",
    "afternoon",
    "obgyn",
    "day",
  ];

  for (let d = 0; d < allDayStates.length; d++) {
    const day = allDayStates[d];
    if (!day) continue;

    const prevDay = d > 0 ? allDayStates[d - 1] : null;

    // Reset weekly shift tracking on Monday
    if (day.dayOfWeek === 1) {
      for (const docState of doctorStates.values()) {
        docState.shiftsThisWeek = 0;
      }
    }

    // Update consecutive night tracking from previous day
    if (prevDay) {
      for (const docState of doctorStates.values()) {
        const prevNight = prevDay.assignments.get("night");
        if (prevNight?.doctorId === docState.doctor.id) {
          docState.consecutiveNights++;
          docState.lastNightDate = prevDay.date;
        } else {
          docState.consecutiveNights = 0;
        }
      }
    }

    // Reduced staffing check (before assignment — counts intrinsic unavailability only)
    const reduced = shouldDropShiftsForDay(
      day,
      ctx,
      doctorStates,
      manualAssignmentsMap
    );
    warnings.push(...reduced.warnings);
    if (reduced.dropObgyn) {
      day.assignments.set("obgyn", {
        date: day.date,
        shiftTypeId: "obgyn",
        doctorId: null,
        source: "cleared",
        isManualOverride: false,
        isShiftActive: false,
        warnings: ["Dropped due to reduced staffing"],
      });
    }
    if (reduced.dropDay) {
      day.assignments.set("day", {
        date: day.date,
        shiftTypeId: "day",
        doctorId: null,
        source: "cleared",
        isManualOverride: false,
        isShiftActive: false,
        warnings: ["Dropped due to reduced staffing"],
      });
    }

    // Rohan's fixed 4 nights Mon-Thu
    if (rohanDocId && day.dayOfWeek >= 1 && day.dayOfWeek <= 4) {
      const rKey = `${day.date}|night`;
      if (!manualAssignmentsMap.has(rKey) && !day.assignments.has("night")) {
        const rohanState = doctorStates.get(rohanDocId);
        if (
          rohanState &&
          !rohanState.leaveDates.has(day.date) &&
          !rohanState.weeklyOffDates.has(day.date)
        ) {
          const weekNights = countShiftsInWeekForDoctor(
            allDayStates,
            d,
            "night",
            rohanDocId,
            ctx.year,
            ctx.month
          );
          if (
            weekNights < 4 &&
            rohanState.shiftsThisWeek < MAX_SHIFTS_PER_WEEK
          ) {
            const a: AssignmentResult = {
              date: day.date,
              shiftTypeId: "night",
              doctorId: rohanDocId,
              source: "generated",
              isManualOverride: false,
              warnings: [],
            };
            day.assignments.set("night", a);
            day.doctorShiftsThisDay.add(rohanDocId);
            rohanState.nightsThisMonth++;
            rohanState.shiftsThisWeek++;
            rohanState.consecutiveNights++;
            rohanState.lastNightDate = day.date;
          }
        }
      }
    }

    // Rohan's 1 Morning + 1 Afternoon per week
    if (rohanDocId) {
      const rohanState = doctorStates.get(rohanDocId);
      if (
        rohanState &&
        !rohanState.leaveDates.has(day.date) &&
        !rohanState.weeklyOffDates.has(day.date)
      ) {
        if (
          !day.doctorShiftsThisDay.has(rohanDocId) &&
          rohanState.shiftsThisWeek < MAX_SHIFTS_PER_WEEK
        ) {
          for (const shiftId of ["morning", "afternoon"] as ShiftTypeId[]) {
            const key = `${day.date}|${shiftId}`;
            if (
              !manualAssignmentsMap.has(key) &&
              !day.assignments.has(shiftId)
            ) {
              const weekCount = countShiftsInWeekForDoctor(
                allDayStates,
                d,
                shiftId,
                rohanDocId,
                ctx.year,
                ctx.month
              );
              if (weekCount < 1) {
                const a: AssignmentResult = {
                  date: day.date,
                  shiftTypeId: shiftId,
                  doctorId: rohanDocId,
                  source: "generated",
                  isManualOverride: false,
                  warnings: [],
                };
                day.assignments.set(shiftId, a);
                day.doctorShiftsThisDay.add(rohanDocId);
                rohanState.shiftsThisWeek++;
                break;
              }
            }
          }
        }
      }
    }

    // Assign remaining shifts
    for (const shiftId of shiftsToAssign) {
      const key = `${day.date}|${shiftId}`;
      if (day.assignments.has(shiftId)) continue;
      if (manualAssignmentsMap.has(key)) continue;

      const shiftType = ctx.shiftTypes.find((s) => s.id === shiftId);
      if (!shiftType) continue;

      const available = getAvailableDoctors(
        ctx,
        doctorStates,
        day,
        shiftId,
        shiftType
      );

      let chosen: Doctor | null = null;

      if (shiftId === "night") {
        chosen = pickBestDoctorForNight(
          available,
          doctorStates,
          nightDistributionCounts
        );
      } else if (shiftId === "obgyn") {
        chosen = pickBestDoctorForObgyn(available, obgynDistributionCounts);
      } else {
        chosen = pickDoctorForOtherShift(available, doctorStates);
      }

      if (chosen) {
        const a: AssignmentResult = {
          date: day.date,
          shiftTypeId: shiftId,
          doctorId: chosen.id,
          source: "generated",
          isManualOverride: false,
          warnings: [],
        };
        day.assignments.set(shiftId, a);
        day.doctorShiftsThisDay.add(chosen.id);

        const docState = doctorStates.get(chosen.id);
        if (docState) {
          docState.shiftsThisWeek++;

          if (shiftId === "night") {
            docState.nightsThisMonth++;
            docState.consecutiveNights++;
            docState.lastNightDate = day.date;
            nightDistributionCounts.set(
              chosen.id,
              (nightDistributionCounts.get(chosen.id) ?? 0) + 1
            );
          }

          if (shiftId === "obgyn") {
            obgynDistributionCounts.set(
              chosen.id,
              (obgynDistributionCounts.get(chosen.id) ?? 0) + 1
            );
          }
        }
      } else {
        const a: AssignmentResult = {
          date: day.date,
          shiftTypeId: shiftId,
          doctorId: null,
          source: "cleared",
          isManualOverride: false,
          isShiftActive: false,
          warnings: [`No eligible doctor for ${shiftId} shift on ${day.date}`],
        };
        day.assignments.set(shiftId, a);
        warnings.push(`${day.date}: No doctor available for ${shiftId} shift`);
      }
    }

    // Fallback: unassigned doctors go to Day shift
    for (const doc of ctx.doctors) {
      const docState = doctorStates.get(doc.id);
      if (!docState) continue;
      if (day.doctorShiftsThisDay.has(doc.id)) continue;
      if (docState.leaveDates.has(day.date)) continue;
      if (docState.weeklyOffDates.has(day.date)) continue;
      if (docState.shiftsThisWeek >= MAX_SHIFTS_PER_WEEK) continue;
      if (isOnRecoveryBlock(docState, day.date)) continue;
      if (day.assignments.has("day")) continue;
      if (!doc.allowed_shifts.includes("day")) continue;

      const dayKey = `${day.date}|day`;
      if (manualAssignmentsMap.has(dayKey)) continue;

      const a: AssignmentResult = {
        date: day.date,
        shiftTypeId: "day",
        doctorId: doc.id,
        source: "generated",
        isManualOverride: false,
        warnings: [],
      };
      day.assignments.set("day", a);
      day.doctorShiftsThisDay.add(doc.id);
      docState.shiftsThisWeek++;
    }
  }

  // Collect all assignments
  for (const day of allDayStates) {
    for (const a of day.assignments.values()) {
      allAssignments.push(a);
    }
  }

  return { assignments: allAssignments, warnings };
}

export function validateManualAssignment(
  ctx: SchedulingContext,
  request: {
    assignmentDate: string;
    shiftTypeId: ShiftTypeId;
    doctorId: string | null;
  }
): string[] {
  const warnings: string[] = [];

  if (!request.doctorId) return warnings;

  const doc = ctx.doctors.find((d) => d.id === request.doctorId);
  if (!doc) {
    warnings.push("Doctor not found");
    return warnings;
  }

  const shiftType = ctx.shiftTypes.find((s) => s.id === request.shiftTypeId);
  if (!shiftType) {
    warnings.push("Shift type not found");
    return warnings;
  }

  if (shiftType.female_only && doc.gender !== "female") {
    warnings.push(`${doc.name} is not eligible for OBGYN shift (female only)`);
  }

  if (!doc.allowed_shifts.includes(request.shiftTypeId)) {
    warnings.push(
      `${doc.name} is not allowed to work ${request.shiftTypeId} shift`
    );
  }

  const { year, month, day } = parseDate(request.assignmentDate);
  const dt = new Date(year, month - 1, day);
  const weekdayName = getWeekdayName(dt.getDay());
  if (weekdayName === doc.weekly_off) {
    warnings.push(`${doc.name} has weekly off on ${weekdayName}`);
  }

  const leaveDates = ctx.leaves.get(doc.id);
  if (leaveDates?.has(request.assignmentDate)) {
    warnings.push(`${doc.name} is on leave on ${request.assignmentDate}`);
  }

  const existingDayAssignments = ctx.existingAssignments.get(
    request.assignmentDate
  );
  if (existingDayAssignments) {
    for (const existing of existingDayAssignments) {
      if (
        existing.doctor_id === doc.id &&
        existing.shift_type_id !== request.shiftTypeId
      ) {
        warnings.push(
          `${doc.name} is already assigned to ${existing.shift_type_id} on ${request.assignmentDate}`
        );
      }
    }
  }

  if (!isRecoveryExempt(doc)) {
    const prevDate = getPrevDateStr(request.assignmentDate);
    const prevDayAssignments = ctx.existingAssignments.get(prevDate);
    if (prevDayAssignments) {
      const prevNight = prevDayAssignments.find(
        (a) => a.shift_type_id === "night"
      );
      if (
        prevNight?.doctor_id === doc.id &&
        request.shiftTypeId !== "afternoon"
      ) {
        warnings.push(
          `${doc.name} had a night shift on ${prevDate} — post-night recovery requires afternoon only or off`
        );
      }
    }
  }

  if (request.shiftTypeId === "night" && doc.slug !== ROHAN_SLUG) {
    const prevDate = getPrevDateStr(request.assignmentDate);
    const prevDayAssignments = ctx.existingAssignments.get(prevDate);
    if (prevDayAssignments) {
      const prevNight = prevDayAssignments.find(
        (a) => a.shift_type_id === "night"
      );
      if (prevNight?.doctor_id === doc.id) {
        warnings.push(
          `${doc.name} had a night shift on ${prevDate} — consecutive night shifts are not allowed`
        );
      }
    }
  }

  if (request.shiftTypeId === "night" && doc.max_nights_per_month) {
    const monthPrefix = request.assignmentDate.substring(0, 7);
    let nightCount = 0;
    for (const [dateKey, dayAssignments] of ctx.existingAssignments) {
      if (dateKey.startsWith(monthPrefix)) {
        const nightA = dayAssignments.find((a) => a.shift_type_id === "night");
        if (nightA?.doctor_id === doc.id) nightCount++;
      }
    }
    if (nightCount >= doc.max_nights_per_month) {
      warnings.push(
        `${doc.name} already has ${doc.max_nights_per_month} night shifts this month (maximum reached)`
      );
    }
  }

  const { year: y, month: m, day: dy } = parseDate(request.assignmentDate);
  const weekKey = getIsoWeekKey(y, m, dy);
  let weekShiftCount = 0;
  for (const [dateKey, dayAssignments] of ctx.existingAssignments) {
    const parsed = parseDate(dateKey);
    if (getIsoWeekKey(parsed.year, parsed.month, parsed.day) === weekKey) {
      for (const a of dayAssignments) {
        if (a.doctor_id === doc.id) weekShiftCount++;
      }
    }
  }
  if (weekShiftCount >= MAX_SHIFTS_PER_WEEK) {
    warnings.push(
      `${doc.name} already has ${MAX_SHIFTS_PER_WEEK} shifts this week (maximum reached)`
    );
  }

  return warnings;
}

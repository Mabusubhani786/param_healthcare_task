/**
 * TypeScript types for Duty Doctor Roster System
 * Derived directly from duty-doctor-roster-schema.sql - NO SCHEMA CHANGES
 */

// ============================================
// Enums (matching PostgreSQL enums exactly)
// ============================================
export type DoctorGender = 'male' | 'female';
export type Weekday = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
export type ShiftTypeId = 'morning' | 'day' | 'obgyn' | 'afternoon' | 'night';
export type AssignmentSource = 'generated' | 'manual' | 'cleared';

// ============================================
// Core Database Entities (1:1 with SQL tables)
// ============================================

export interface Doctor {
  id: string;                    // UUID
  slug: string;                  // Unique text (e.g., 'meera', 'rohan')
  name: string;                  // Full name (e.g., 'Dr. Meera Kapoor')
  gender: DoctorGender;
  weekly_off: Weekday;
  allowed_shifts: ShiftTypeId[]; // Array of shift IDs
  max_nights_per_month: number | null;
  notes: string | null;
  is_active: boolean;            // Soft delete flag
  created_at: string;            // ISO timestamp
}

export interface ShiftType {
  id: ShiftTypeId;               // Primary key: 'morning' | 'day' | 'obgyn' | 'afternoon' | 'night'
  name: string;                  // Display name
  starts_at: string;             // HH:MM:SS format
  ends_at: string;               // HH:MM:SS format
  min_doctors: number;           // Always 1 per schema
  female_only: boolean;          // true only for 'obgyn'
  retention_priority: number;    // 1=highest (night), 5=lowest (obgyn)
  created_at: string;
}

export interface RosterMonth {
  id: string;                    // UUID
  year: number;                  // >= 2020
  month: number;                 // 1-12
  generated_at: string | null;   // ISO timestamp
  created_at: string;
}

export interface DoctorLeave {
  id: string;                    // UUID
  doctor_id: string;             // FK -> doctors.id
  leave_date: string;            // YYYY-MM-DD
  reason: string | null;
  created_at: string;
}

export interface RosterAssignment {
  id: string;                    // UUID
  roster_month_id: string;       // FK -> roster_months.id
  assignment_date: string;       // YYYY-MM-DD
  shift_type_id: ShiftTypeId;    // FK -> shift_types.id
  doctor_id: string | null;      // FK -> doctors.id (nullable for unassigned)
  is_shift_active: boolean;      // For reduced staffing
  source: AssignmentSource;
  is_manual_override: boolean;
  override_note: string | null;
  updated_at: string;
  created_at: string;
}

// ============================================
// Extended / Computed Types (for API & UI)
// ============================================

export interface DoctorWithAvailability extends Doctor {
  // Computed fields for scheduling
  weeklyOffDates: string[];      // YYYY-MM-DD dates for this month
  leaveDates: string[];          // YYYY-MM-DD dates for this month
  assignedNightsThisMonth: number;
  assignedShiftsThisWeek: number; // Current week (Mon-Sun)
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ShiftTypeWithPriority extends ShiftType {
  // retention_priority: 1=night, 2=morning, 3=afternoon, 4=day, 5=obgyn
}

export interface DayShiftAssignment {
  date: string;                  // YYYY-MM-DD
  shiftTypeId: ShiftTypeId;
  doctor: Doctor | null;
  isManualOverride: boolean;
  overrideNote: string | null;
  isShiftActive: boolean;
}

export interface DayAssignments {
  date: string;                  // YYYY-MM-DD
  shifts: DayShiftAssignment[];
  unavailableDoctors: string[];  // Doctor IDs unavailable this day
}

export interface MonthRosterData {
  rosterMonth: RosterMonth;
  doctors: Doctor[];
  shiftTypes: ShiftType[];
  leaves: DoctorLeave[];
  assignments: RosterAssignment[];
  calendar: DayAssignments[];    // One per day of month
}

export interface GenerateRosterRequest {
  year: number;
  month: number;                 // 1-12
  overwriteManual?: boolean;     // Default: false - don't overwrite manual overrides
}

export interface GenerateRosterResponse {
  rosterMonth: RosterMonth;
  assignmentsCreated: number;
  assignmentsSkipped: number;    // Manual overrides preserved
  warnings: string[];            // Constraint violations, reduced staffing, etc.
}

export interface ManualAssignmentRequest {
  rosterMonthId: string;
  assignmentDate: string;        // YYYY-MM-DD
  shiftTypeId: ShiftTypeId;
  doctorId: string | null;       // null = clear assignment
  overrideNote?: string;
}

export interface ManualAssignmentResponse {
  assignment: RosterAssignment;
  validationWarnings: string[];
}

export interface LeaveRequest {
  doctorId: string;
  leaveDate: string;             // YYYY-MM-DD
  reason?: string;
}

export interface LeaveResponse {
  leave: DoctorLeave;
}

// ============================================
// Scheduling Algorithm Types
// ============================================

export interface DoctorAvailability {
  doctorId: string;
  doctor: Doctor;
  isAvailable: boolean;
  unavailableReasons: string[];
  // Constraints
  maxNightsPerMonth: number | null;
  nightsAssignedThisMonth: number;
  shiftsAssignedThisWeek: number;
  lastNightShiftDate: string | null;  // For post-night recovery
  consecutiveNightCount: number;
}

export interface ShiftRequirement {
  shiftTypeId: ShiftTypeId;
  minDoctors: number;
  femaleOnly: boolean;
  priority: number;  // Lower = higher priority
}

export interface SchedulingContext {
  year: number;
  month: number;
  daysInMonth: number;
  doctors: Doctor[];
  shiftTypes: ShiftType[];
  leaves: Map<string, Set<string>>;      // doctorId -> Set of leave dates
  existingAssignments: Map<string, RosterAssignment[]>; // date -> assignments
  manualOverrides: Set<string>;           // "date|shiftTypeId" keys
  weeklyOffDates: Map<string, Set<string>>; // doctorId -> Set of weekly off dates
}

export interface AssignmentResult {
  date: string;
  shiftTypeId: ShiftTypeId;
  doctorId: string | null;
  source: AssignmentSource;
  isManualOverride: boolean;
  isShiftActive?: boolean;
  warnings: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// ============================================
// Constants (derived from schema)
// ============================================

export const SHIFT_PRIORITY_ORDER: ShiftTypeId[] = ['night', 'morning', 'afternoon', 'day', 'obgyn'];

export const SHIFT_DISPLAY_NAMES: Record<ShiftTypeId, string> = {
  morning: 'Morning Shift',
  day: 'Day Shift',
  obgyn: 'OBGYN Shift',
  afternoon: 'Afternoon Shift',
  night: 'Night Shift',
};

export const SHIFT_TIMES: Record<ShiftTypeId, { start: string; end: string }> = {
  morning: { start: '08:00', end: '14:00' },
  day: { start: '10:00', end: '18:00' },
  obgyn: { start: '10:00', end: '18:00' },
  afternoon: { start: '14:00', end: '20:00' },
  night: { start: '20:00', end: '08:00' },
};

export const DOCTOR_SLUGS = ['meera', 'rohan', 'aditya', 'priya', 'imran', 'kavya'] as const;
export type DoctorSlug = typeof DOCTOR_SLUGS[number];

// Doctors exempt from post-night recovery
export const POST_NIGHT_RECOVERY_EXEMPT_SLUGS = ['rohan'] as const;

// Doctors eligible for OBGYN (female)
export const OBGYN_ELIGIBLE_SLUGS = ['meera', 'priya', 'kavya'] as const;

// Doctors for equal night distribution (all except Rohan & Imran)
export const NIGHT_DISTRIBUTION_SLUGS = ['meera', 'aditya', 'priya', 'kavya'] as const;

// Imran's special constraints
export const IMRAN_SLUG = 'imran';
export const IMRAN_MAX_NIGHTS_PER_MONTH = 2;
export const IMRAN_ALLOWED_SHIFTS: ShiftTypeId[] = ['day', 'night'];

// Rohan's fixed weekly requirements
export const ROHAN_SLUG = 'rohan';
export const ROHAN_NIGHTS_PER_WEEK = 4;      // Mon-Thu
export const ROHAN_MORNING_PER_WEEK = 1;
export const ROHAN_AFTERNOON_PER_WEEK = 1;

// Weekly shift limit
export const MAX_SHIFTS_PER_WEEK = 6;
import type {
  Doctor,
  ShiftType,
  RosterMonth,
  DoctorLeave,
  RosterAssignment,
  GenerateRosterResponse,
} from "@/types/roster.types"

export interface PaginationInfo {
  count: number
  current_page: number
  total_page_count: number
  total_record_count: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationInfo
}

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000"

export class ApiError extends Error {
  statusCode?: number
  data?: unknown

  constructor(message: string, statusCode?: number, data?: unknown) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.data = data
  }
}

async function handleResponse<T>(res: Response): Promise<{ data: T[]; pagination?: PaginationInfo }> {
  let body: { status?: string; data?: unknown; message?: string; pagination?: PaginationInfo }
  try {
    body = await res.json()
  } catch {
    throw new ApiError(`Request failed with status ${res.status}`, res.status)
  }
  if (body.status === "fail") {
    throw new ApiError(body.message ?? "Request failed", res.status, body.data)
  }
  return { data: (body.data ?? []) as T[], pagination: body.pagination }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    })
    const { data } = await handleResponse<T>(res)
    return data as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(err instanceof Error ? err.message : "Network error")
  }
}

async function requestSingle<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    })
    const { data } = await handleResponse<T>(res)
    return data[0] as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(err instanceof Error ? err.message : "Network error")
  }
}

async function requestPaginated<T>(url: string, options?: RequestInit): Promise<PaginatedResponse<T>> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    })
    const body = await res.json()
    if (body.status === "fail") {
      throw new ApiError(body.message ?? "Request failed", res.status, body.data)
    }
    return {
      data: body.data as T[],
      pagination: body.pagination ?? { count: 0, current_page: 1, total_page_count: 1, total_record_count: 0 },
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(err instanceof Error ? err.message : "Network error")
  }
}

// --- Doctor CRUD ---

export async function getDoctors(page?: number, limit?: number): Promise<PaginatedResponse<Doctor>> {
  const params: Record<string, string> = { is_active: "true" }
  if (page !== undefined) params.page = String(page)
  if (limit !== undefined) params.limit = String(limit)
  const qs = "?" + new URLSearchParams(params).toString()
  return requestPaginated<Doctor>(`${API_BASE}/doctors${qs}`)
}

export async function getDoctorById(id: string): Promise<Doctor> {
  return requestSingle<Doctor>(`${API_BASE}/doctors/${id}`)
}

export async function createDoctor(data: Partial<Doctor>): Promise<Doctor> {
  return requestSingle<Doctor>(`${API_BASE}/doctors`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateDoctor(id: string, data: Partial<Doctor>): Promise<Doctor> {
  return requestSingle<Doctor>(`${API_BASE}/doctors/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteDoctor(id: string): Promise<void> {
  await request(`${API_BASE}/doctors/${id}`, { method: "DELETE" })
}

// --- Shift type CRUD ---

export async function getShiftTypes(): Promise<ShiftType[]> {
  return request<ShiftType[]>(`${API_BASE}/shift-types`)
}

// --- Roster month CRUD ---

export async function getRosterMonths(params?: Record<string, string>): Promise<RosterMonth[]> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return request<RosterMonth[]>(`${API_BASE}/roster-months${qs}`)
}

export async function createRosterMonth(data: { year: number; month: number }): Promise<RosterMonth> {
  return requestSingle<RosterMonth>(`${API_BASE}/roster-months`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

// --- Roster assignment CRUD ---

export async function getRosterAssignments(params?: Record<string, string>): Promise<RosterAssignment[]> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return request<RosterAssignment[]>(`${API_BASE}/roster-assignments${qs}`)
}

export async function createRosterAssignment(data: Partial<RosterAssignment>): Promise<RosterAssignment> {
  return requestSingle<RosterAssignment>(`${API_BASE}/roster-assignments`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateRosterAssignment(id: string, data: Partial<RosterAssignment>): Promise<RosterAssignment> {
  return requestSingle<RosterAssignment>(`${API_BASE}/roster-assignments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteRosterAssignment(id: string): Promise<void> {
  await request(`${API_BASE}/roster-assignments/${id}`, { method: "DELETE" })
}

// --- Leave CRUD ---

export async function getDoctorLeaves(page?: number, limit?: number): Promise<PaginatedResponse<DoctorLeave>> {
  const params: Record<string, string> = {}
  if (page !== undefined) params.page = String(page)
  if (limit !== undefined) params.limit = String(limit)
  const qs = Object.keys(params).length ? "?" + new URLSearchParams(params).toString() : ""
  return requestPaginated<DoctorLeave>(`${API_BASE}/doctor-leaves${qs}`)
}

export async function createDoctorLeave(data: { doctor_id: string; leave_date: string; reason?: string }): Promise<DoctorLeave> {
  return requestSingle<DoctorLeave>(`${API_BASE}/doctor-leaves`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateDoctorLeave(id: string, data: { doctor_id?: string; leave_date?: string; reason?: string }): Promise<DoctorLeave> {
  return requestSingle<DoctorLeave>(`${API_BASE}/doctor-leaves/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteDoctorLeave(id: string): Promise<void> {
  await request(`${API_BASE}/doctor-leaves/${id}`, { method: "DELETE" })
}

// --- Roster generation ---

export async function generateRosterAPI(
  year: number,
  month: number,
  overwriteManual = false,
): Promise<GenerateRosterResponse> {
  return requestSingle<GenerateRosterResponse>(`${API_BASE}/generate-roster`, {
    method: "POST",
    body: JSON.stringify({ year, month, overwriteManual }),
  })
}

// --- Manual assignment with validation ---

export interface ManualAssignmentResult {
  assignment: RosterAssignment
  validationWarnings: string[]
  hasHardErrors: boolean
}

export async function manualAssignAPI(data: {
  rosterMonthId: string
  assignmentDate: string
  shiftTypeId: string
  doctorId: string | null
  isShiftActive?: boolean
  overrideNote?: string
}): Promise<ManualAssignmentResult> {
  return requestSingle<ManualAssignmentResult>(`${API_BASE}/manual-assignment`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function validateAssignmentAPI(data: {
  rosterMonthId: string
  assignmentDate: string
  shiftTypeId: string
  doctorId: string
}): Promise<{ warnings: string[] }> {
  return requestSingle<{ warnings: string[] }>(`${API_BASE}/validate-assignment`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

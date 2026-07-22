import type { Doctor, ShiftType, RosterMonth, DoctorLeave, RosterAssignment } from "@/types/roster.types"

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000"

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  const body = await res.json()
  if (body.status === "fail") throw new Error(body.message)
  return body.data as T
}

export async function getDoctors(): Promise<Doctor[]> {
  return request<Doctor[]>(`${API_BASE}/doctors`)
}

export async function getShiftTypes(): Promise<ShiftType[]> {
  return request<ShiftType[]>(`${API_BASE}/shift-types`)
}

export async function getDoctorLeaves(params?: Record<string, string>): Promise<DoctorLeave[]> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return request<DoctorLeave[]>(`${API_BASE}/doctor-leaves${qs}`)
}

export async function getRosterMonths(params?: Record<string, string>): Promise<RosterMonth[]> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return request<RosterMonth[]>(`${API_BASE}/roster-months${qs}`)
}

export async function createRosterMonth(data: { year: number; month: number }): Promise<RosterMonth> {
  return request<RosterMonth>(`${API_BASE}/roster-months`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function getRosterAssignments(params?: Record<string, string>): Promise<RosterAssignment[]> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : ""
  return request<RosterAssignment[]>(`${API_BASE}/roster-assignments${qs}`)
}

export async function createRosterAssignment(data: Partial<RosterAssignment>): Promise<RosterAssignment> {
  return request<RosterAssignment>(`${API_BASE}/roster-assignments`, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateRosterAssignment(id: string, data: Partial<RosterAssignment>): Promise<RosterAssignment> {
  return request<RosterAssignment>(`${API_BASE}/roster-assignments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteRosterAssignment(id: string): Promise<void> {
  await request(`${API_BASE}/roster-assignments/${id}`, { method: "DELETE" })
}

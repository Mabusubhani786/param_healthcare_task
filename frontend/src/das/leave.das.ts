import {
  getDoctorLeaves as apiGetLeaves,
  createDoctorLeave as apiCreateLeave,
  updateDoctorLeave as apiUpdateLeave,
  deleteDoctorLeave as apiDeleteLeave,
  type PaginationInfo,
} from "@/lib/api"
import type { DoctorLeave, Doctor } from "@/types/roster.types"

export interface LeaveWithDoctor extends DoctorLeave {
  doctorName: string
  doctorSlug: string
}

export async function getLeaves(
  doctors: Doctor[],
  page?: number,
  limit?: number,
): Promise<{ leaves: LeaveWithDoctor[]; pagination: PaginationInfo }> {
  const res = await apiGetLeaves(page, limit)
  const doctorMap = new Map(doctors.map((d) => [d.id, d]))

  return {
    leaves: res.data
      .map((l) => ({
        ...l,
        doctorName: doctorMap.get(l.doctor_id)?.name ?? "Unknown",
        doctorSlug: doctorMap.get(l.doctor_id)?.slug ?? "",
      }))
      .sort((a, b) => a.leave_date.localeCompare(b.leave_date)),
    pagination: res.pagination,
  }
}

export async function createLeave(data: {
  doctor_id: string
  leave_date: string
  reason?: string
}): Promise<DoctorLeave> {
  return apiCreateLeave(data)
}

export async function updateLeave(id: string, data: {
  doctor_id?: string
  leave_date?: string
  reason?: string
}): Promise<DoctorLeave> {
  return apiUpdateLeave(id, data)
}

export async function deleteLeave(id: string): Promise<void> {
  await apiDeleteLeave(id)
}

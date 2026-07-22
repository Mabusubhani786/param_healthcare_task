import {
  getDoctors as apiGetDoctors,
  getDoctorById as apiGetDoctorById,
  createDoctor as apiCreateDoctor,
  updateDoctor as apiUpdateDoctor,
  deleteDoctor as apiDeleteDoctor,
  type PaginationInfo,
} from "@/lib/api"
import type { Doctor, Weekday, DoctorGender } from "@/types/roster.types"

export interface DoctorWithMeta extends Doctor {
  weeklyOffLabel: string
  genderLabel: string
}

const WEEKDAY_LABELS: Record<Weekday, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
}

const GENDER_LABELS: Record<DoctorGender, string> = {
  male: "Male",
  female: "Female",
}

function enrichDoctor(d: Doctor): DoctorWithMeta {
  return {
    ...d,
    weeklyOffLabel: WEEKDAY_LABELS[d.weekly_off] ?? d.weekly_off,
    genderLabel: GENDER_LABELS[d.gender] ?? d.gender,
  }
}

export async function getDoctors(page?: number, limit?: number): Promise<{ doctors: DoctorWithMeta[]; pagination: PaginationInfo }> {
  const res = await apiGetDoctors(page, limit)
  return {
    doctors: res.data.map(enrichDoctor),
    pagination: res.pagination,
  }
}

export async function getDoctorById(id: string): Promise<DoctorWithMeta> {
  const doc = await apiGetDoctorById(id)
  return enrichDoctor(doc)
}

export async function createDoctor(data: {
  slug: string
  name: string
  gender: DoctorGender
  weekly_off: Weekday
  allowed_shifts?: string[]
  notes?: string
}): Promise<DoctorWithMeta> {
  const doc = await apiCreateDoctor(data as Partial<Doctor>)
  return enrichDoctor(doc)
}

export async function updateDoctor(id: string, data: Partial<Doctor>): Promise<DoctorWithMeta> {
  const doc = await apiUpdateDoctor(id, data)
  return enrichDoctor(doc)
}

export async function deleteDoctor(id: string): Promise<void> {
  await apiDeleteDoctor(id)
}

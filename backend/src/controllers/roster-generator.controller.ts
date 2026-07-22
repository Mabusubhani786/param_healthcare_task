import type { FastifyRequest, FastifyReply } from "fastify";
import { supabase } from "@/config/supabase.ts";
import {
  formatSuccessResponse,
  formatFailResponse,
} from "@/helper/response-formatter.ts";
import {
  buildSchedulingContext,
  generateRoster,
  validateManualAssignment,
} from "@/services/roster-generator.service.ts";
import type {
  Doctor,
  ShiftType,
  DoctorLeave,
  RosterAssignment,
  RosterMonth,
  ShiftTypeId,
} from "@/types/roster.types.ts";

interface GenerateRosterBody {
  year: number;
  month: number;
  overwriteManual?: boolean;
}

interface ManualAssignmentBody {
  rosterMonthId: string;
  assignmentDate: string;
  shiftTypeId: ShiftTypeId;
  doctorId: string | null;
  isShiftActive?: boolean;
  overrideNote?: string;
}

async function fetchAllDoctors(): Promise<Doctor[]> {
  const { data, error } = await supabase.from("doctors").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

async function fetchAllShiftTypes(): Promise<ShiftType[]> {
  const { data, error } = await supabase.from("shift_types").select("*").order("retention_priority");
  if (error) throw error;
  return data ?? [];
}

async function fetchLeaves(year: number, month: number): Promise<DoctorLeave[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .from("doctor_leaves")
    .select("*")
    .gte("leave_date", startDate)
    .lt("leave_date", endDate);
  if (error) throw error;
  return data ?? [];
}

async function fetchAssignments(rosterMonthId: string): Promise<RosterAssignment[]> {
  const { data, error } = await supabase
    .from("roster_assignments")
    .select("*")
    .eq("roster_month_id", rosterMonthId)
    .order("assignment_date");
  if (error) throw error;
  return data ?? [];
}

export const generateRosterHandler = async (
  request: FastifyRequest<{ Body: GenerateRosterBody }>,
  reply: FastifyReply,
) => {
  try {
    const { year, month, overwriteManual = false } = request.body;

    if (!year || !month || month < 1 || month > 12) {
      return reply.code(400).send(
        formatFailResponse({ message: "Invalid year or month" })
      );
    }

    // Get or create roster month
    let { data: rosterMonth } = await supabase
      .from("roster_months")
      .select("*")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (!rosterMonth) {
      const { data: created, error: createError } = await supabase
        .from("roster_months")
        .insert({ year, month })
        .select()
        .single();
      if (createError) throw createError;
      rosterMonth = created;
    }

    // Fetch data
    const [doctors, shiftTypes, leaves, existingAssignments] = await Promise.all([
      fetchAllDoctors(),
      fetchAllShiftTypes(),
      fetchLeaves(year, month),
      fetchAssignments(rosterMonth.id),
    ]);

    // Build scheduling context
    const ctx = buildSchedulingContext(
      year, month, doctors, shiftTypes, leaves, existingAssignments, overwriteManual,
    );

    // Generate roster
    const { assignments, warnings } = generateRoster(ctx);

    // Filter out manual overrides if not overwriting
    const toUpsert = assignments.filter((a) => {
      if (a.isManualOverride && !overwriteManual) return false;
      return true;
    });

    // Delete non-manual existing assignments (or all if overwriteManual)
    if (overwriteManual) {
      await supabase
        .from("roster_assignments")
        .delete()
        .eq("roster_month_id", rosterMonth.id);
    } else {
      // Only delete generated assignments
      const manualKeys = existingAssignments
        .filter((a) => a.is_manual_override)
        .map((a) => a.id);

      if (manualKeys.length > 0) {
        await supabase
          .from("roster_assignments")
          .delete()
          .eq("roster_month_id", rosterMonth.id)
          .not("id", "in", `(${manualKeys.join(",")})`);
      } else {
        await supabase
          .from("roster_assignments")
          .delete()
          .eq("roster_month_id", rosterMonth.id);
      }
    }

    // Upsert new assignments
    if (toUpsert.length > 0) {
      const rows = toUpsert.map((a) => ({
        roster_month_id: rosterMonth!.id,
        assignment_date: a.date,
        shift_type_id: a.shiftTypeId,
        doctor_id: a.doctorId,
        is_shift_active: a.isShiftActive !== false,
        source: a.isManualOverride ? "manual" : "generated",
        is_manual_override: a.isManualOverride,
        override_note: null,
      }));

      // Insert in batches to avoid payload limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error: upsertError } = await supabase
          .from("roster_assignments")
          .upsert(batch, {
            onConflict: "roster_month_id,assignment_date,shift_type_id",
          });
        if (upsertError) throw upsertError;
      }
    }

    // Update generated_at
    await supabase
      .from("roster_months")
      .update({ generated_at: new Date().toISOString() })
      .eq("id", rosterMonth.id);

    // Re-fetch the updated roster month
    const { data: updatedMonth } = await supabase
      .from("roster_months")
      .select("*")
      .eq("id", rosterMonth.id)
      .single();

    return reply.code(200).send(
      formatSuccessResponse({
        data: {
          rosterMonth: updatedMonth ?? rosterMonth,
          assignmentsCreated: toUpsert.length,
          assignmentsSkipped: assignments.length - toUpsert.length,
          warnings,
        },
        message: "Roster generated successfully",
      })
    );
  } catch (error) {
    const err = error as { code?: string; message?: string; details?: string };
    const msg = err.message ?? String(error);
    console.error("Roster generation error:", msg);

    if (msg.includes("42P01") || (msg.includes("relation") && msg.includes("does not exist"))) {
      return reply.code(500).send(
        formatFailResponse({ message: "Required database table is not available", data: [] })
      );
    }

    return reply.code(500).send(
      formatFailResponse({ message: "Failed to generate roster", data: [] })
    );
  }
};

export const manualAssignmentHandler = async (
  request: FastifyRequest<{ Body: ManualAssignmentBody }>,
  reply: FastifyReply,
) => {
  try {
    const { rosterMonthId, assignmentDate, shiftTypeId, doctorId, isShiftActive, overrideNote } = request.body;

    if (!rosterMonthId || !assignmentDate || !shiftTypeId) {
      return reply.code(400).send(
        formatFailResponse({ message: "Missing required fields: rosterMonthId, assignmentDate, shiftTypeId" })
      );
    }

    // Fetch context for validation
    const { data: rosterMonth } = await supabase
      .from("roster_months")
      .select("*")
      .eq("id", rosterMonthId)
      .maybeSingle();

    if (!rosterMonth) {
      return reply.code(404).send(
        formatFailResponse({ message: "Roster month not found" })
      );
    }

    const [doctors, shiftTypes, leaves, existingAssignments] = await Promise.all([
      fetchAllDoctors(),
      fetchAllShiftTypes(),
      fetchLeaves(rosterMonth.year, rosterMonth.month),
      fetchAssignments(rosterMonthId),
    ]);

    const ctx = buildSchedulingContext(
      rosterMonth.year, rosterMonth.month, doctors, shiftTypes, leaves, existingAssignments, false,
    );

    // Validate
    const validationWarnings = doctorId
      ? validateManualAssignment(ctx, { assignmentDate, shiftTypeId, doctorId })
      : [];

    // Check for hard errors
    const hardErrors = validationWarnings.filter((w) =>
      w.includes("not eligible") || w.includes("not allowed") || w.includes("maximum reached")
    );

    // Upsert the assignment
    const row = {
      roster_month_id: rosterMonthId,
      assignment_date: assignmentDate,
      shift_type_id: shiftTypeId,
      doctor_id: doctorId,
      is_shift_active: isShiftActive ?? doctorId !== null,
      source: doctorId === null ? "cleared" : "manual",
      is_manual_override: doctorId !== null,
      override_note: overrideNote ?? null,
    };

    const { data: assignment, error } = await supabase
      .from("roster_assignments")
      .upsert(row, {
        onConflict: "roster_month_id,assignment_date,shift_type_id",
      })
      .select()
      .single();

    if (error) throw error;

    return reply.code(200).send(
      formatSuccessResponse({
        data: {
          assignment,
          validationWarnings,
          hasHardErrors: hardErrors.length > 0,
        },
        message: "Assignment updated",
      })
    );
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error("Manual assignment error:", err.message ?? err);
    return reply.code(500).send(
      formatFailResponse({ message: "Failed to update assignment", data: [] })
    );
  }
};

export const validateAssignmentHandler = async (
  request: FastifyRequest<{
    Body: { rosterMonthId: string; assignmentDate: string; shiftTypeId: ShiftTypeId; doctorId: string };
  }>,
  reply: FastifyReply,
) => {
  try {
    const { rosterMonthId, assignmentDate, shiftTypeId, doctorId } = request.body;

    const { data: rosterMonth } = await supabase
      .from("roster_months")
      .select("*")
      .eq("id", rosterMonthId)
      .maybeSingle();

    if (!rosterMonth) {
      return reply.code(404).send(
        formatFailResponse({ message: "Roster month not found" })
      );
    }

    const [doctors, shiftTypes, leaves, existingAssignments] = await Promise.all([
      fetchAllDoctors(),
      fetchAllShiftTypes(),
      fetchLeaves(rosterMonth.year, rosterMonth.month),
      fetchAssignments(rosterMonthId),
    ]);

    const ctx = buildSchedulingContext(
      rosterMonth.year, rosterMonth.month, doctors, shiftTypes, leaves, existingAssignments, false,
    );

    const warnings = validateManualAssignment(ctx, { assignmentDate, shiftTypeId, doctorId });

    return reply.code(200).send(
      formatSuccessResponse({
        data: { warnings },
        message: "Validation complete",
      })
    );
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error("Validation error:", err.message ?? err);
    return reply.code(500).send(
      formatFailResponse({ message: "Validation failed", data: [] })
    );
  }
};

import RestController from "@/helper/rest.controller.ts";
import { supabase } from "@/config/supabase.ts";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  formatSuccessResponse,
} from "@/helper/response-formatter.ts";
import type { Doctor } from "@/types/roster.types.ts";

class DoctorController extends RestController<Doctor, Partial<Doctor>> {
  constructor() {
    super({
      tableName: "doctors",
      schema: "public",
      lookupID: "id",
      searchAble: true,
      orderBy: "name",
    });
  }

  protected override getSearchFields(): string[] {
    return ["name", "slug", "notes"];
  }

  public readonly remove = async (
    request: FastifyRequest<{ Params: Record<string, string> }>,
    reply: FastifyReply
  ) => {
    return this.withErrorHandling(reply, async () => {
      const lookupValue = this.getLookupValue(request);
      const filterString = this.buildSupabaseFilter(lookupValue);

      const { data: updated, error } = await supabase
        .from(this.tableName)
        .update({ is_active: false })
        .or(filterString)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!updated) {
        throw createHttpError(404, "Record not found", {
          [this.lookupID]: lookupValue,
        });
      }

      return reply.send(
        formatSuccessResponse({
          data: { success: true, [this.lookupID]: lookupValue },
          message: "Deleted successfully",
          pagination: {
            count: 1,
            current_page: 1,
            total_page_count: 1,
            total_record_count: 1,
          },
        })
      );
    });
  };

  public readonly getById = async (
    request: FastifyRequest<{ Params: Record<string, string> }>,
    reply: FastifyReply
  ) => {
    return this.withErrorHandling(reply, async () => {
      const lookupValue = this.getLookupValue(request);
      const filterString = this.buildSupabaseFilter(lookupValue);

      const { data: record, error } = await supabase
        .from(this.tableName)
        .select("*")
        .or(filterString)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;

      if (!record) {
        throw createHttpError(404, "Record not found", {
          [this.lookupID]: lookupValue,
        });
      }

      return reply.send(
        formatSuccessResponse({
          data: record,
          message: "Fetched successfully",
          pagination: {
            count: 1,
            current_page: 1,
            total_page_count: 1,
            total_record_count: 1,
          },
        })
      );
    });
  };
}

const createHttpError = (
  statusCode: number,
  message: string,
  details?: unknown
) => {
  const error = new Error(message) as any;
  error.statusCode = statusCode;
  error.details = details;
  return error;
};

export default new DoctorController();

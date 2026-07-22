import type { FastifyReply, FastifyRequest } from "fastify";
import { supabase } from "@/config/supabase.ts";
import {
  formatFailResponse,
  formatSuccessResponse,
} from "@/helper/response-formatter.ts";

type SaveOperation = "create" | "update";

interface HttpError extends Error {
  statusCode: number;
  details?: unknown;
}

export interface RestControllerConfig {
  tableName: string;
  schema: string;
  lookupID: string;
  searchAble?: boolean;
  searchable?: boolean;
  orderBy?: string;
  oederBy?: string;
}

const isHttpError = (error: unknown): error is HttpError => {
  if (!(error instanceof Error)) {
    return false;
  }
  return typeof (error as Partial<HttpError>).statusCode === "number";
};

const createHttpError = (
  statusCode: number,
  message: string,
  details?: unknown
): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
};

export default abstract class RestController<
  TCreate extends object,
  TUpdate extends Partial<TCreate> = Partial<TCreate>,
> {
  protected readonly tableName: string;
  protected readonly schema: string;
  protected readonly lookupID: string;
  protected readonly searchAble: boolean;
  protected readonly orderBy: string | undefined;
  private static readonly DEFAULT_PAGE = 1;
  private static readonly DEFAULT_PAGE_COUNT = 10;

  protected constructor(config: RestControllerConfig) {
    this.tableName = config.tableName;
    this.schema = config.schema;
    this.lookupID = config.lookupID;
    this.searchAble = config.searchAble ?? config.searchable ?? false;
    this.orderBy = config.orderBy ?? config.oederBy;
  }

  protected async preSave(
    payload: TCreate | TUpdate,
    _request: FastifyRequest,
    _operation: SaveOperation
  ): Promise<TCreate | TUpdate> {
    return payload;
  }

  protected async postSave(
    response: unknown,
    _request: FastifyRequest,
    _operation: SaveOperation
  ): Promise<unknown> {
    return response;
  }

  protected getSearchFields(): string[] {
    return [];
  }

  public readonly create = async (
    request: FastifyRequest<{ Body: TCreate }>,
    reply: FastifyReply
  ) => {
    return this.withErrorHandling(reply, async () => {
      const payload = (await this.preSave(
        request.body as TCreate,
        request,
        "create"
      )) as TCreate;

      const { data, error } = await supabase
        .from(this.tableName)
        .insert(payload as Record<string, unknown>)
        .select()
        .single();

      if (error) throw error;

      const response = await this.postSave(data, request, "create");
      return reply.code(201).send(
        formatSuccessResponse({
          data: response,
          message: "Created successfully",
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

  public readonly getAll = async (request: FastifyRequest, reply: FastifyReply) => {
    return this.withErrorHandling(reply, async () => {
      const queryObj = this.buildSearchQuery(request);
      const { page, pageCount, hasPagination } = this.getPaginationOptions(request);

      let totalCount: number | null = null;
      let countQuery = supabase
        .from(this.tableName)
        .select("*", { count: "exact", head: true });

      countQuery = this.applyFilters(countQuery, queryObj);

      const headRes = await countQuery;

      if (headRes.error) {
        if (!(headRes.error as { message?: string }).message) {
          totalCount = null;
        } else {
          throw headRes.error;
        }
      } else {
        totalCount = headRes.count;
      }

      let dataQuery = supabase.from(this.tableName).select("*");

      dataQuery = this.applyFilters(dataQuery, queryObj);

      if (hasPagination) {
        const start = (page - 1) * pageCount;
        dataQuery = dataQuery.range(start, start + pageCount - 1);
      }

      if (this.orderBy) {
        const ascending = !this.orderBy.startsWith("-");
        const field = this.orderBy.replace(/^-/, "");
        dataQuery = dataQuery.order(field, { ascending });
      }

      const { data: records, error: dataError } = await dataQuery;

      if (dataError) throw dataError;

      if (!hasPagination) {
        return reply.send(
          formatSuccessResponse({
            data: records ?? [],
            message: "Fetched successfully",
            totalRecordCount: (records ?? []).length,
            keyValue: this.extractKeyValueFilters(request),
          })
        );
      }

      const total = totalCount ?? 0;
      const totalPageCount = total > 0 ? Math.ceil(total / pageCount) : 0;

      return reply.send(
        formatSuccessResponse({
          data: records ?? [],
          message: "Fetched successfully",
          pagination: {
            count: pageCount,
            current_page: page,
            total_page_count: totalPageCount,
            total_record_count: total,
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

  public readonly update = async (
    request: FastifyRequest<{ Params: Record<string, string>; Body: TUpdate }>,
    reply: FastifyReply
  ) => {
    return this.withErrorHandling(reply, async () => {
      const lookupValue = this.getLookupValue(request);
      const filterString = this.buildSupabaseFilter(lookupValue);
      const payload = (await this.preSave(
        request.body as TUpdate,
        request,
        "update"
      )) as TUpdate;

      const { data: updated, error } = await supabase
        .from(this.tableName)
        .update(payload as Record<string, unknown>)
        .or(filterString)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!updated) {
        throw createHttpError(404, "Record not found", {
          [this.lookupID]: lookupValue,
        });
      }

      const response = await this.postSave(updated, request, "update");
      return reply.send(
        formatSuccessResponse({
          data: response,
          message: "Updated successfully",
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

  public readonly remove = async (
    request: FastifyRequest<{ Params: Record<string, string> }>,
    reply: FastifyReply
  ) => {
    return this.withErrorHandling(reply, async () => {
      const lookupValue = this.getLookupValue(request);
      const filterString = this.buildSupabaseFilter(lookupValue);

      const { data: deleted, error } = await supabase
        .from(this.tableName)
        .delete()
        .or(filterString)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!deleted) {
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

  protected getLookupValue(
    request: FastifyRequest<{ Params: Record<string, string> }>
  ): string {
    const lookupValue = request.params[this.lookupID] ?? request.params.id;
    if (!lookupValue) {
      throw createHttpError(400, `Missing route param '${this.lookupID}'`);
    }
    return lookupValue;
  }

  protected buildSupabaseFilter(lookupValue: string): string {
    const trimmed = lookupValue.trim();
    if (!trimmed) {
      return `${this.lookupID}.eq.${lookupValue}`;
    }
    return `${this.lookupID}.eq.${trimmed},id.eq.${trimmed}`;
  }

  private buildSearchQuery(request: FastifyRequest): Record<string, unknown> {
    const query = this.normalizeQueryFilters(
      request.query as Record<string, unknown>
    );
    const idParam = query.id;
    delete query.id;
    delete query.q;
    delete query.page;
    delete query.page_count;
    delete query.limit;

    const queryParts: Record<string, unknown>[] = [];
    if (Object.keys(query).length > 0) {
      queryParts.push(query);
    }

    if (idParam !== undefined && idParam !== null && idParam !== "") {
      const idValue = Array.isArray(idParam) ? idParam[0] : idParam;
      queryParts.push({ $or: [{ [this.lookupID]: String(idValue) }, { id: String(idValue) }] });
    }

    if (!this.searchAble) {
      return this.combineQueryParts(queryParts);
    }

    const searchText = (request.query as Record<string, unknown>).q;
    if (typeof searchText !== "string" || !searchText.trim()) {
      return this.combineQueryParts(queryParts);
    }

    const fields = this.getSearchFields();
    if (!fields.length) {
      return this.combineQueryParts(queryParts);
    }

    queryParts.push({
      $or: fields.map((field) => ({
        [field]: { $regex: searchText.trim(), $options: "i" },
      })),
    });

    return this.combineQueryParts(queryParts);
  }

  private applyFilters(query: any, filters: Record<string, unknown>): any {
    for (const [key, value] of Object.entries(filters)) {
      if (key === "$or" && Array.isArray(value)) {
        const orParts: string[] = [];
        for (const condition of value as Record<string, unknown>[]) {
          const parts: string[] = [];
          for (const [k, v] of Object.entries(condition)) {
            if (typeof v === "object" && v !== null && "$regex" in v) {
              parts.push(`${k}.ilike.%${String((v as Record<string, unknown>).$regex)}%`);
            } else {
              parts.push(`${k}.eq.${v}`);
            }
          }
          orParts.push(parts.join(","));
        }
        query = query.or(orParts.join(","));
      } else if (key === "$and" && Array.isArray(value)) {
        for (const condition of value as Record<string, unknown>[]) {
          query = this.applyFilters(query, condition);
        }
      } else if (typeof value === "object" && value !== null && "$regex" in value) {
        query = query.ilike(key, `%${String((value as Record<string, unknown>).$regex)}%`);
      } else {
        query = query.eq(key, value);
      }
    }
    return query;
  }

  private normalizeQueryFilters(
    queryParams: Record<string, unknown>
  ): Record<string, unknown> {
    const normalizedQuery: Record<string, unknown> = {};

    Object.entries(queryParams).forEach(([key, rawValue]) => {
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        return;
      }

      if (Array.isArray(rawValue)) {
        const normalizedArray = rawValue.map((value) =>
          this.normalizeQueryValue(key, value)
        );
        normalizedQuery[key] = normalizedArray;
        return;
      }

      normalizedQuery[key] = this.normalizeQueryValue(key, rawValue);
    });

    return normalizedQuery;
  }

  private normalizeQueryValue(key: string, value: unknown): unknown {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return trimmedValue;
    }

    if (key === "id") {
      const numericValue = Number(trimmedValue);
      if (Number.isInteger(numericValue)) {
        return numericValue;
      }
    }

    return trimmedValue;
  }

  private combineQueryParts(
    parts: Record<string, unknown>[]
  ): Record<string, unknown> {
    if (parts.length === 0) {
      return {};
    }

    if (parts.length === 1) {
      return parts[0]!;
    }

    return { $and: parts };
  }

  private getPaginationOptions(request: FastifyRequest): {
    page: number;
    pageCount: number;
    hasPagination: boolean;
  } {
    const requestQuery = request.query as Record<string, unknown>;
    const hasPage = requestQuery.page !== undefined;
    const hasPageCount =
      requestQuery.page_count !== undefined || requestQuery.limit !== undefined;
    const hasPagination = hasPage || hasPageCount;
    const rawPage = Number(requestQuery.page);
    const rawPageCount = Number(requestQuery.page_count ?? requestQuery.limit);

    const page = Number.isInteger(rawPage) && rawPage > 0
      ? rawPage
      : RestController.DEFAULT_PAGE;
    const pageCount =
      Number.isInteger(rawPageCount) && rawPageCount > 0
        ? rawPageCount
        : RestController.DEFAULT_PAGE_COUNT;

    return { page, pageCount, hasPagination };
  }

  private extractKeyValueFilters(
    request: FastifyRequest
  ): Record<string, unknown> {
    const query = this.normalizeQueryFilters(
      request.query as Record<string, unknown>
    );

    delete query.page;
    delete query.page_count;
    delete query.limit;
    delete query.q;

    return query;
  }

  protected async withErrorHandling(
    reply: FastifyReply,
    executor: () => Promise<FastifyReply>
  ): Promise<FastifyReply> {
    try {
      return await executor();
    } catch (error) {
      if (isHttpError(error)) {
        return reply.code(error.statusCode).send(
          formatFailResponse({
            message: error.message,
            data: error.details ? [error.details] : [],
          })
        );
      }

      const err = error as { code?: string; message?: string; details?: string; hint?: string };
      const pgError = err.message ?? String(error);

      if (err.code === "42P01" || pgError.includes("relation") && pgError.includes("does not exist")) {
        return reply.code(500).send(
          formatFailResponse({
            message: `Table '${this.tableName}' is not available`,
            data: [],
          })
        );
      }

      if (err.code === "23505") {
        return reply.code(409).send(
          formatFailResponse({
            message: "Duplicate record already exists",
            data: err.details ? [err.details] : [],
          })
        );
      }

      if (err.code === "23503") {
        return reply.code(400).send(
          formatFailResponse({
            message: "Referenced record not found",
            data: err.details ? [err.details] : [],
          })
        );
      }

      if (err.code === "42501") {
        console.error(`[${this.tableName}] Permission denied`);
        return reply.send(
          formatSuccessResponse({
            data: [],
            message: "No data available",
            pagination: { count: 0, current_page: 1, total_page_count: 1, total_record_count: 0 },
          })
        );
      }

      // Network / connection errors
      if (pgError.includes("ECONNREFUSED") || pgError.includes("fetch failed")) {
        return reply.code(503).send(
          formatFailResponse({
            message: "Database connection unavailable",
            data: [],
          })
        );
      }

      console.error(`[${this.tableName}] Error:`, err.message || `[code=${err.code}]`, err.details || err.hint || "");
      return reply.code(500).send(
        formatFailResponse({
          message: err.message || "An unexpected error occurred",
          data: err.code ? [{ code: err.code, details: err.details, hint: err.hint }] : [],
        })
      );
    }
  }
}

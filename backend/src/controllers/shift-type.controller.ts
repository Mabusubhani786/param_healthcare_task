import RestController from "@/helper/rest.controller.ts";
import type { ShiftType } from "@/types/roster.types.ts";

class ShiftTypeController extends RestController<ShiftType, Partial<ShiftType>> {
  constructor() {
    super({
      tableName: "shift_types",
      schema: "public",
      lookupID: "id",
      searchAble: true,
      orderBy: "retention_priority",
    });
  }

  protected override getSearchFields(): string[] {
    return ["name"];
  }
}

export default new ShiftTypeController();

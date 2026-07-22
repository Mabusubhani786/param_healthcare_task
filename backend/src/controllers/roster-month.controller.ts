import RestController from "@/helper/rest.controller.ts";
import type { RosterMonth } from "@/types/roster.types.ts";

class RosterMonthController extends RestController<RosterMonth, Partial<RosterMonth>> {
  constructor() {
    super({
      tableName: "roster_months",
      schema: "public",
      lookupID: "id",
      orderBy: "-created_at",
    });
  }
}

export default new RosterMonthController();

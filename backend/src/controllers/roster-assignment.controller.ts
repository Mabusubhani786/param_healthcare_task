import RestController from "@/helper/rest.controller.ts";
import type { RosterAssignment } from "@/types/roster.types.ts";

class RosterAssignmentController extends RestController<RosterAssignment, Partial<RosterAssignment>> {
  constructor() {
    super({
      tableName: "roster_assignments",
      schema: "public",
      lookupID: "id",
      orderBy: "-assignment_date",
    });
  }
}

export default new RosterAssignmentController();

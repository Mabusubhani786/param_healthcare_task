import RestController from "@/helper/rest.controller.ts";
import type { DoctorLeave } from "@/types/roster.types.ts";

class DoctorLeaveController extends RestController<DoctorLeave, Partial<DoctorLeave>> {
  constructor() {
    super({
      tableName: "doctor_leaves",
      schema: "public",
      lookupID: "id",
      orderBy: "leave_date",
    });
  }

  protected override getSearchFields(): string[] {
    return ["reason"];
  }
}

export default new DoctorLeaveController();

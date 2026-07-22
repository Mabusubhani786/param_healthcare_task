import RestController from "@/helper/rest.controller.ts";
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
}

export default new DoctorController();

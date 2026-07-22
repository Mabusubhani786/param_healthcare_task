import type { FastifyInstance, FastifyReply } from "fastify";
import { healthCheckHandler } from "@/controllers/health.controller.ts";
import doctorController from "@/controllers/doctor.controller.ts";
import shiftTypeController from "@/controllers/shift-type.controller.ts";
import rosterMonthController from "@/controllers/roster-month.controller.ts";
import doctorLeaveController from "@/controllers/doctor-leave.controller.ts";
import rosterAssignmentController from "@/controllers/roster-assignment.controller.ts";

const registerCrud = (
  server: FastifyInstance,
  prefix: string,
  ctrl: {
    create: (req: any, reply: FastifyReply) => Promise<FastifyReply>;
    getAll: (req: any, reply: FastifyReply) => Promise<FastifyReply>;
    getById: (req: any, reply: FastifyReply) => Promise<FastifyReply>;
    update: (req: any, reply: FastifyReply) => Promise<FastifyReply>;
    remove: (req: any, reply: FastifyReply) => Promise<FastifyReply>;
  },
) => {
  server.post(`/${prefix}`, ctrl.create);
  server.get(`/${prefix}`, ctrl.getAll);
  server.get(`/${prefix}/:id`, ctrl.getById);
  server.put(`/${prefix}/:id`, ctrl.update);
  server.patch(`/${prefix}/:id`, ctrl.update);
  server.delete(`/${prefix}/:id`, ctrl.remove);
};

const registerRoutes = async (server: FastifyInstance) => {
  server.get("/ping", async () => "pong\n");
  server.get("/health", healthCheckHandler);

  registerCrud(server, "doctors", doctorController);
  registerCrud(server, "shift-types", shiftTypeController);
  registerCrud(server, "roster-months", rosterMonthController);
  registerCrud(server, "doctor-leaves", doctorLeaveController);
  registerCrud(server, "roster-assignments", rosterAssignmentController);
};

export default registerRoutes;

import { supabase } from "@/config/supabase.ts";

const APP_TABLES = ["doctors", "shift_types", "roster_months", "doctor_leaves", "roster_assignments"];

export const healthCheckHandler = async () => {
  let dbStatus = "disconnected";
  const tableStatus: Record<string, boolean> = {};

  try {
    for (const table of APP_TABLES) {
      const { error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .limit(0);
      tableStatus[table] = !error;
    }

    dbStatus = Object.values(tableStatus).some(Boolean) ? "connected" : "disconnected";
  } catch {
    dbStatus = "error";
  }

  return {
    health: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database: dbStatus,
    tables: tableStatus,
  };
};

export default { healthCheckHandler };

import { supabase } from "@/config/supabase.ts";

const connectDB = async () => {
  const { error } = await supabase.from("health_check").select("*", { count: "exact", head: true }).limit(0).maybeSingle();

  if (error && error.code !== "42P01") {
    console.error("Supabase connection error:", error.message);
    throw error;
  }

  console.log("Supabase connected");
};

export default connectDB;

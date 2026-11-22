export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
      throw new Error("Production startup requires a PostgreSQL DATABASE_URL");
    }
    if (!process.env.FREMIQ_SECRET || process.env.FREMIQ_SECRET.length < 32) {
      throw new Error("Production startup requires a stable FREMIQ_SECRET of at least 32 characters");
    }
  }
  try {
    const { ensureDirs } = await import("./lib/storage");
    ensureDirs();
    const { kickQueue } = await import("./lib/jobs/queue");
    kickQueue();
  } catch (error) {
    console.error("[fremiq] startup initialisation failed", error);
  }
}

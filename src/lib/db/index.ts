import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { fremiqPool?: Pool };

const pool =
  globalForDb.fremiqPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.fremiqPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };

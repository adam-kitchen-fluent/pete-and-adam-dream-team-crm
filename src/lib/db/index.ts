import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import path from "path";
import * as schema from "./schema";

const url = `file:${path.join(process.cwd(), "data", "crm.db")}`;
const client = createClient({ url });

export const db = drizzle(client, { schema });
export { schema };

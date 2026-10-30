import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { Pool as NodePool } from 'pg';

import * as schemaModule from '../../../packages/database/src/schemas';
import { getDatabaseDriver, getDatabaseUrl } from './config';

// Migration tools share the PostgreSQL-only policy of the application.
getDatabaseDriver();
const pool = new NodePool({ connectionString: getDatabaseUrl() });
const db = nodeDrizzle(pool, { schema: schemaModule });

export { db, pool };
export * as schema from '../../../packages/database/src/schemas';

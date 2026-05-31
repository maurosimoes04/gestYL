import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error('DATABASE_URL nao definido. Configure a variavel de ambiente antes de iniciar o backend.');
}

const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export { prisma };

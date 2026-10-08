$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'start-local-database.ps1')
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
		$identityOutput = @'
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Client } from 'pg';

const databaseUrl = parse(readFileSync('.env', 'utf8')).DATABASE_URL;
if (!databaseUrl) throw new Error('La configuración local DATABASE_URL no está disponible.');
const url = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) || Number(url.port || 5432) !== 55433 || decodeURIComponent(url.pathname.slice(1)) !== 'enertrade_dev') {
	throw new Error('backend/.env no apunta a enertrade_dev en el PostgreSQL local esperado.');
}

const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
try {
	await client.connect();
	const identity = (await client.query('SELECT current_database() AS database, host(inet_server_addr()) AS host, inet_server_port() AS port, current_user AS user')).rows[0];
	if (identity.database !== 'enertrade_dev' || identity.port !== 55433 || !['127.0.0.1', '::1'].includes(identity.host) || identity.user !== decodeURIComponent(url.username)) {
		throw new Error('La identidad SQL no corresponde al PostgreSQL local esperado.');
	}
	console.log('Identidad PostgreSQL local verificada (loopback:55433/enertrade_dev).');
} catch {
	console.error('PostgreSQL local esperado no está disponible o su identidad no coincide.');
	process.exitCode = 1;
} finally {
	await client.end().catch(() => {});
}
'@ | bun -
		if ($LASTEXITCODE -ne 0) { throw 'No se inicia backend sin verificar PostgreSQL local.' }

		$hadDatabaseUrl = Test-Path Env:DATABASE_URL
		$previousDatabaseUrl = $env:DATABASE_URL
		try {
				Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
				bun run dev
		} finally {
				if ($hadDatabaseUrl) { $env:DATABASE_URL = $previousDatabaseUrl }
				else { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
		}
} finally { Pop-Location }

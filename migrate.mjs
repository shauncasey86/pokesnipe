import { execSync } from "child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is not set, skipping migrations");
  process.exit(0);
}

// Railway sets PGHOST/PGPORT/etc. env vars that override the connection string
// in the pg library. Strip them so node-pg-migrate uses our DATABASE_URL.
const env = { ...process.env };
delete env.PGHOST;
delete env.PGPORT;
delete env.PGDATABASE;
delete env.PGUSER;
delete env.PGPASSWORD;

console.log(`migrate: running against ${url.replace(/\/\/.*@/, "//***@")}`);
try {
  execSync(`node-pg-migrate -m migrations -d "${url}" up`, {
    stdio: "inherit",
    env
  });
} catch (err) {
  console.error("migrate: migration failed, continuing startup anyway", err);
}

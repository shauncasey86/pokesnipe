import { execSync } from "child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is not set, skipping migrations");
  process.exit(0);
}

console.log(`migrate: running against ${url.replace(/\/\/.*@/, "//***@")}`);
try {
  execSync(`node-pg-migrate -m migrations -d "${url}" up`, {
    stdio: "inherit",
    env: process.env
  });
} catch (err) {
  console.error("migrate: migration failed, continuing startup anyway", err);
}

import "dotenv/config";
import pg from "pg";
import { mkdir, writeFile } from "node:fs/promises";

const tables = [
  "User",
  "PasswordResetToken",
  "Semester",
  "Discipline",
  "Schedule",
  "ScheduleAttendance",
  "Material",
  "Evaluation",
  "Task",
  "InboxItem",
  "Notification",
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const snapshot = {};
for (const table of tables) {
  const { rows } = await client.query(`SELECT * FROM "${table}"`);
  snapshot[table] = rows;
}
await client.end();

const dir = "prisma/backups";
await mkdir(dir, { recursive: true });
const file = `${dir}/snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
await writeFile(file, JSON.stringify(snapshot, null, 2), "utf8");

for (const table of tables) {
  console.log(`${table}: ${snapshot[table].length} linhas`);
}
console.log(`\nSnapshot salvo em ${file}`);

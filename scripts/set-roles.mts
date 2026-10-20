/*
 * Bootstrap or change staff roles from the command line (the in-app Users page needs an admin
 * to already exist). Usage: npm run user:roles -- someone@example.com admin [content_editor ...]
 */
import { scriptDb } from "./_db.mts";
import { setRolesByEmail } from "./_tasks.ts";

const [email, ...roles] = process.argv.slice(2);
if (!email || !roles.length) {
  console.error("Usage: npm run user:roles -- <email> <role...>   roles: student, teacher_reviewer, content_editor, admin");
  process.exit(1);
}
const { db, close } = scriptDb();
const r = await setRolesByEmail(db, email, roles);
if (!r.ok) {
  console.error(r.error);
  process.exitCode = 1;
} else console.log(`${email} now has roles: ${r.roles.join(", ")}`);
await close();

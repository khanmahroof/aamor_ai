import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
async function main() {
  let contents: string;
  try {
    contents = await readFile(".env", "utf8");
  } catch {
    contents = await readFile(".env.example", "utf8");
  }
  if (/^AUTH_SECRET=[ \t]*\r?$/m.test(contents))
    contents = contents.replace(
      /^AUTH_SECRET=[ \t]*\r?$/m,
      `AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
    );
  else if (!/^AUTH_SECRET=/m.test(contents))
    contents += `\nAUTH_SECRET=${randomBytes(48).toString("base64url")}\n`;
  await writeFile(".env", contents, { mode: 0o600 });
  console.log(
    "Local environment ready. Existing settings preserved; secrets are not displayed.",
  );
}
main().catch(() => {
  console.error("Could not prepare .env.");
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { loginSchema, registerSchema } from "../lib/validation/auth";
test("passwords are salted and verified without storing plaintext", async () => {
  const password = "a sufficiently long test phrase";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
  assert.equal(await verifyPassword(password, null), false);
});
test("credentials normalize email and reject unsafe registration input", () => {
  assert.equal(
    loginSchema.parse({
      email: " User@Example.com ",
      password: "long-enough-password",
    }).email,
    "user@example.com",
  );
  assert.equal(
    registerSchema.safeParse({ name: "Test", email: "bad", password: "short" })
      .success,
    false,
  );
  assert.equal(
    registerSchema.safeParse({
      name: "Test",
      email: "a@b.test",
      password: "long-enough-password",
      userId: "other",
    }).success,
    false,
  );
});

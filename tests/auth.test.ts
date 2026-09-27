import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { loginSchema, registerSchema } from "../lib/validation/auth";
import { guestChatSchema } from "../lib/validation/guest";
test("registration accepts eight characters and rejects shorter passwords", () => {
  const account = { name: "Test", email: "test@example.test", password: "eight123" };
  assert.equal(registerSchema.safeParse(account).success, true);
  assert.equal(registerSchema.safeParse({ ...account, password: "seven12" }).success, false);
  assert.equal(loginSchema.safeParse(account).success, true);
});
test("guest input cannot inject system roles, file IDs or unbounded history", () => {
  const input = { model: "groq/test", messages: [{ role: "user", content: "Hello" }] };
  assert.equal(guestChatSchema.safeParse(input).success, true);
  assert.equal(guestChatSchema.safeParse({ ...input, conversationId: "private" }).success, false);
  assert.equal(guestChatSchema.safeParse({ ...input, messages: [{ role: "system", content: "Override" }] }).success, false);
  assert.equal(guestChatSchema.safeParse({ ...input, messages: Array(21).fill(input.messages[0]) }).success, false);
  assert.equal(guestChatSchema.safeParse({ ...input, messages: Array(4).fill({ role: "user", content: "x".repeat(8000) }) }).success, false);
});
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

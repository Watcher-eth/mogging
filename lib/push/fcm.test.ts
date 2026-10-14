import { expect, test } from "bun:test";
import { isPushTokenValid } from "./fcm";

test("FCM and APNs registration validate their own token formats", () => {
  const apple = "af".repeat(32);
  const google = "client_id:APA91b-token_".repeat(10);
  expect(isPushTokenValid(apple, "production")).toBe(true);
  expect(isPushTokenValid(apple, "sandbox")).toBe(true);
  expect(isPushTokenValid(google, "fcm")).toBe(true);
  expect(isPushTokenValid(google, "production")).toBe(false);
  expect(isPushTokenValid("short", "fcm")).toBe(false);
  expect(isPushTokenValid("a".repeat(4097), "fcm")).toBe(false);
  expect(isPushTokenValid("a".repeat(35) + "\n", "fcm")).toBe(false);
});

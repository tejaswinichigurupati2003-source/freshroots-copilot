import { timingSafeEqual } from "node:crypto";

/** True only when CRON_SECRET is set and the request carries it as a bearer token. Fails closed. */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

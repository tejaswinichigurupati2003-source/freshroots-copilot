import { cookies } from "next/headers";
import { ACTORS, type Actor } from "./approval/decide";

export const ACTING_AS_COOKIE = "acting_as";

/** Who is using the app. A cookie stands in for real login. Defaults to Raghav. */
export async function getActingAs(): Promise<Actor> {
  const value = (await cookies()).get(ACTING_AS_COOKIE)?.value;
  return ACTORS.find((a) => a === value) ?? "Raghav";
}

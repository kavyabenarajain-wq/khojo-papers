import "server-only";
import { cookies } from "next/headers";

export const PREVIEW_COOKIE = "khojo_preview";

/** Staff-only switch that shows unpublished content in student views. Callers must also check the role. */
export async function isPreviewMode(): Promise<boolean> {
  return (await cookies()).get(PREVIEW_COOKIE)?.value === "1";
}

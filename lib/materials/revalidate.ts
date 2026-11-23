import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Called by admin material routes after a successful write, so the storefront (ISR) and the
 * subscriber library show the change on the next request without a new deploy. "/" refreshes only the Home page
 * (its carousel), never the shared layout.
 */
export function revalidateMaterialPages() {
  revalidatePath("/materiais");
  revalidatePath("/aluno/recursos");
  revalidatePath("/");
}

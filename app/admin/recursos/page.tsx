import { AdminLayout } from "@/components/layout/AdminLayout";
import { requirePageAccess } from "@/lib/auth/page-access";
import { getMaterials } from "@/lib/materials/server";
import { MaterialError } from "@/lib/materials/service-core";
import { getPrivateStorage } from "@/lib/storage/server";
import { materials as catalog } from "@/lib/materials/catalog";
import { toMaterialAdminView, type MaterialAdminView } from "@/lib/materials/types";
import { MaterialManager } from "@/components/materials/MaterialManager";
import { MaterialCatalogReadOnly } from "@/components/materials/MaterialCatalogReadOnly";

export default async function AdminRecursosPage() {
  const { user } = await requirePageAccess("admin");
  let materials: MaterialAdminView[] | null;
  try {
    materials = (await getMaterials().listAdmin()).map(toMaterialAdminView);
  } catch (error) {
    // Persistence not enabled in this environment: keep the read-only catalog instead of a broken panel.
    if (error instanceof MaterialError && error.code === "MATERIALS_PERSISTENCE_DISABLED") {
      return <AdminLayout viewer={user}><MaterialCatalogReadOnly /></AdminLayout>;
    }
    materials = null;
  }
  // Only existing local images are offered as covers (cover upload is a later stage).
  const coverOptions = Array.from(new Set(catalog.map(material => material.image)));
  return (
    <AdminLayout viewer={user}>
      <MaterialManager initialMaterials={materials} coverOptions={coverOptions} storageConfigured={getPrivateStorage().configured} />
    </AdminLayout>
  );
}

import { AdminLayout } from "@/components/layout/AdminLayout";
import { requirePageAccess } from "@/lib/auth/page-access";
import { getLessons } from "@/lib/lessons/server";
import { LessonManager } from "@/components/lessons/LessonManager";

export default async function AdminAulasPage() {
  const { user } = await requirePageAccess("admin");
  let lessons;
  try { lessons = await getLessons().listAdmin(); } catch { lessons = null; }
  return <AdminLayout viewer={user}><LessonManager initialLessons={lessons} /></AdminLayout>;
}

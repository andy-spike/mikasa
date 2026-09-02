import { AppShell } from "@/components/app-shell";
import { SettingsView } from "@/components/settings-view";
import { listOwnedCourses } from "@/lib/db/courses";
import { db } from "@/lib/db";
import { requireLearner } from "@/lib/session";

export default async function SettingsPage() {
  const { user } = await requireLearner();
  const owned = await listOwnedCourses(db, user.id);

  return (
    <AppShell section="Settings">
      <SettingsView email={user.email} courseCount={owned.length} />
    </AppShell>
  );
}

import { requirePageUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import { SettingsForm } from "@/components/settings-form";
import { PageShell } from "@/components/page-shell";
import { settingsSchema } from "@/lib/validation/settings";
export default async function Settings() {
  const user = await requirePageUser();
  const saved = await getDatabase().userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });
  const initial = settingsSchema.parse({
    systemPrompt: saved.systemPrompt,
    preferredProvider: saved.preferredProvider,
    preferredModel: saved.preferredModel,
    temperature: saved.temperature,
    theme: saved.theme,
  });
  return (
    <PageShell
      title="Your preferences"
      subtitle="A few small adjustments. A more personal assistant."
    >
      <SettingsForm initial={initial} />
    </PageShell>
  );
}

import { requirePageUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import { PageShell } from "@/components/page-shell";
export default async function UsagePage() {
  const user = await requirePageUser();
  const db = getDatabase();
  const [conversations, messages, byModel, recent] = await Promise.all([
    db.conversation.count({ where: { userId: user.id } }),
    db.message.count({ where: { conversation: { userId: user.id } } }),
    db.usageRecord.groupBy({
      by: ["provider", "model", "estimated"],
      where: { userId: user.id },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
      _count: true,
    }),
    db.usageRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { conversation: { select: { title: true } } },
    }),
  ]);
  return (
    <PageShell
      title="A little perspective"
      subtitle="Your conversations and model usage, all in one place."
    >
      <div className="stat-grid">
        <div>
          <span>Conversations</span>
          <strong>{conversations}</strong>
        </div>
        <div>
          <span>Messages</span>
          <strong>{messages}</strong>
        </div>
        <div>
          <span>Generations</span>
          <strong>
            {byModel.reduce((sum, group) => sum + group._count, 0)}
          </strong>
        </div>
      </div>
      <section className="usage-section">
        <h2>Usage by model</h2>
        <p className="small muted">
          Reported counts come from the provider. Estimates are approximate.
          Local model use has no API charge; no monetary cost is calculated
          here.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Source</th>
                <th>Input</th>
                <th>Output</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((row) => (
                <tr key={`${row.provider}/${row.model}/${row.estimated}`}>
                  <td>
                    {row.model}
                    <small>{row.provider}</small>
                  </td>
                  <td>{row.estimated ? "Estimated" : "Reported"}</td>
                  <td>{row._sum.inputTokens?.toLocaleString() ?? "—"}</td>
                  <td>{row._sum.outputTokens?.toLocaleString() ?? "—"}</td>
                  <td>{row._sum.totalTokens?.toLocaleString() ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!byModel.length && (
            <p className="muted small">
              Usage will appear after your first response.
            </p>
          )}
        </div>
      </section>
      <section className="usage-section">
        <h2>Recent activity</h2>
        {recent.map((item) => (
          <div className="activity" key={item.id}>
            <div>
              {item.conversation.title}
              <small>
                {item.provider} / {item.model}
              </small>
            </div>
            <span>
              {item.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC
            </span>
          </div>
        ))}
      </section>
    </PageShell>
  );
}

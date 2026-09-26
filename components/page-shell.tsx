import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="detail-page">
      <Link className="back-link" href="/chat">
        <ArrowLeft size={15} /> Back to conversations
      </Link>
      <div className="detail-heading">
        <p className="eyebrow">AAMOR / YOUR WORKSPACE</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {children}
    </main>
  );
}

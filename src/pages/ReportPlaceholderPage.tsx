import { PageHeader } from '../components/ui';

export function ReportPlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-5">
      <PageHeader title={title} description={`${title} is being prepared.`} />
      <section className="glass-card p-6">
        <p className="relative z-10 text-dashboard-text-sub">{title} is being prepared.</p>
      </section>
    </div>
  );
}

import { Construction } from 'lucide-react';
import { PageHeader } from '../components/ui';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description ?? 'This section is coming in a future phase.'} />
      <div className="glass-card flex flex-col items-center justify-center py-20">
        <div className="glass-icon mb-5 h-16 w-16 rounded-2xl">
          <Construction className="text-dashboard-teal" size={32} />
        </div>
        <p className="text-dashboard-text-sub">Under development</p>
      </div>
    </div>
  );
}

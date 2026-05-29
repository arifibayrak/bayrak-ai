import { BrandCard } from '@/components/brand';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectsLoading() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <BrandCard key={i}>
          <BrandCard.Body>
            <Skeleton className="h-16 w-full" />
          </BrandCard.Body>
        </BrandCard>
      ))}
    </div>
  );
}

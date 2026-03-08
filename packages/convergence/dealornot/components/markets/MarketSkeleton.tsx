import { GlassCard } from "@/components/glass";

export function MarketCardSkeleton() {
  return (
    <GlassCard className="p-6 animate-pulse">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-5 bg-white/10 rounded w-16" />
            <div className="h-4 bg-white/10 rounded w-20" />
          </div>
          <div className="h-7 bg-white/10 rounded w-3/4 mb-2" />
          <div className="h-4 bg-white/10 rounded w-1/3" />
        </div>

        {/* Center */}
        <div className="flex flex-col gap-2 min-w-[200px]">
          <div className="h-4 bg-white/10 rounded w-full" />
          <div className="h-4 bg-white/10 rounded w-full" />
        </div>

        {/* Right - Odds */}
        <div className="flex flex-col gap-2 min-w-[180px]">
          <div className="h-24 bg-white/10 rounded-lg" />
          <div className="h-24 bg-white/10 rounded-lg" />
        </div>

        {/* Button */}
        <div className="flex items-center">
          <div className="h-10 w-24 bg-white/10 rounded-lg" />
        </div>
      </div>
    </GlassCard>
  );
}

export function MarketDetailSkeleton() {
  return (
    <div className="space-y-6">
      <GlassCard className="p-8 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-1/4 mb-4" />
        <div className="h-10 bg-white/10 rounded w-2/3 mb-6" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-16 bg-white/10 rounded" />
          <div className="h-16 bg-white/10 rounded" />
          <div className="h-16 bg-white/10 rounded" />
        </div>
      </GlassCard>

      <GlassCard className="p-8 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-1/3 mb-6" />
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="h-32 bg-white/10 rounded-xl" />
          <div className="h-32 bg-white/10 rounded-xl" />
        </div>
        <div className="h-12 bg-white/10 rounded-xl mb-6" />
        <div className="h-14 bg-white/10 rounded-xl" />
      </GlassCard>
    </div>
  );
}

export function BetCardSkeleton() {
  return (
    <div className="p-4 bg-white/5 rounded-lg animate-pulse">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="h-8 w-16 bg-white/10 rounded-lg" />
          <div className="h-4 w-32 bg-white/10 rounded" />
        </div>
        <div className="text-right">
          <div className="h-5 w-24 bg-white/10 rounded mb-1" />
          <div className="h-3 w-16 bg-white/10 rounded" />
        </div>
      </div>
    </div>
  );
}

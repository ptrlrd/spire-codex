// A route-level loading boundary also changes what a link prefetch costs:
// with one present, prefetching a dynamic route fetches this cheap shell
// instead of a full origin render of the target page.
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

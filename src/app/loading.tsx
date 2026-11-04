/** Shown while a page loads its data. Soft bars in the shape of the stat cards and the table. */
export default function Loading() {
  const bar = "animate-pulse rounded-2xl bg-mint";
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-3">
        <div className={`h-9 w-80 max-w-full ${bar}`} />
        <div className={`h-4 w-96 max-w-full ${bar}`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-[168px] ${bar}`} />
        ))}
      </div>
      <div className={`h-64 w-full ${bar}`} />
    </div>
  );
}

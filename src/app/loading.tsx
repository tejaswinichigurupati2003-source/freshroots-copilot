/** Shown while a page loads its data. Grey bars in the shape of the summary and the first rows. */
export default function Loading() {
  const bar = "animate-pulse bg-rule";
  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-7 px-5 pb-20 pt-5 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3 border-b-2 border-ink pb-3">
        <div className={`h-[30px] w-[30px] ${bar}`} />
        <div className={`h-6 w-40 ${bar}`} />
      </div>
      <div className="flex flex-col gap-3">
        <div className={`h-3 w-48 ${bar}`} />
        <div className={`h-10 w-96 max-w-full ${bar}`} />
      </div>
      <div className="grid gap-6 border-y border-rule-strong py-5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className={`h-3 w-28 ${bar}`} />
            <div className={`h-8 w-32 ${bar}`} />
          </div>
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`h-14 w-full ${bar}`} style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </main>
  );
}

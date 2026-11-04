import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] max-w-xl flex-col justify-center gap-4">
      <p className="eyebrow">Error 404</p>
      <h1 className="text-[48px]">Page not found</h1>
      <p className="text-ink-soft">There is nothing at this address. Use the tabs for recommendations, the monitor and the audit log.</p>
      <div>
        <Link href="/" className="btn btn-primary">
          Back to recommendations
        </Link>
      </div>
    </div>
  );
}

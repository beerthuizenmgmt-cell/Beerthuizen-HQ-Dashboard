"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold">Er ging iets mis</h1>
        <p className="mt-2 text-sm text-text-muted">
          Dit scherm kon niet geladen worden. Probeer het opnieuw; blijft het misgaan, kijk dan in de
          serverlogs wat er precies fout ging.
        </p>
        <button type="button" onClick={reset} className="btn btn-primary mt-5">
          Opnieuw proberen
        </button>
      </div>
    </main>
  );
}

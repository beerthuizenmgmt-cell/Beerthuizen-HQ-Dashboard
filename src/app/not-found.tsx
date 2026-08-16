import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold">Niet gevonden</h1>
        <p className="mt-2 text-sm text-text-muted">
          Deze pagina bestaat niet, of hij is verwijderd.
        </p>
        <Link href="/hq" className="btn btn-primary mt-5">
          Terug naar HQ
        </Link>
      </div>
    </main>
  );
}

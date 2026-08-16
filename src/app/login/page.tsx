import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/hq");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      {/* Zachte gloed in merkkleuren, zoals de belichting achter de kop op de site */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60rem 40rem at 15% -10%, #ff450022, transparent 60%), radial-gradient(50rem 35rem at 90% 110%, #0047ff1a, transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-9 text-center">
          <div className="mb-6 flex justify-center">
            <Logo size="lg" />
          </div>
          <p className="eyebrow-rule">Interne toegang</p>
          <h1 className="mt-3 text-3xl leading-tight">
            Het kantoor van je <span className="accent-serif">AI-team</span>
          </h1>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-text-faint">Beerthuizen Management · Blaricum</p>
      </div>
    </main>
  );
}

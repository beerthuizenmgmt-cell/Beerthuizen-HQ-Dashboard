import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/hq");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-white">
            BH
          </div>
          <h1 className="text-xl font-semibold">BHMGMT HQ</h1>
          <p className="mt-1 text-sm text-text-muted">Het kantoor van je AI-team</p>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}

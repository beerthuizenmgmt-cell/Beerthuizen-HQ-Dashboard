import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/hq");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-5 flex justify-center">
            <Logo size="lg" />
          </div>
          <h1 className="text-2xl">
            Het kantoor van je <span className="accent-serif">AI-team</span>
          </h1>
          <p className="eyebrow mt-2">Beerthuizen Management</p>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}

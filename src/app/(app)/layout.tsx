import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { SidebarNav } from "@/components/sidebar-nav";
import { Logo, LogoMark } from "@/components/logo";
import { areasFor } from "@/lib/access";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const unread = await db.notification.count({ where: { readAt: null } });

  // De navigatie komt uit dezelfde lijst als de toegangscontrole, zodat er nooit
  // een link zichtbaar is die vervolgens geweigerd wordt.
  const links = areasFor(user.role).map((area) => ({
    path: area.path,
    label: area.label,
    icon: area.icon,
  }));

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg-elevated md:flex">
        <div className="px-5 py-6">
          <Logo />
        </div>

        <SidebarNav links={links} unread={unread} />

        <div className="mt-auto border-t border-border p-4">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-text-faint">{user.email}</p>
          <p className="eyebrow mt-1">{user.role === "owner" ? "Eigenaar" : "Teamlid"}</p>
          <form action={logout} className="mt-3">
            <button type="submit" className="btn btn-ghost w-full text-xs">
              Uitloggen
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobiele navigatie */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
          <Link href="/hq">
            <LogoMark />
          </Link>
          <SidebarNav links={links} unread={unread} compact />
        </header>

        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

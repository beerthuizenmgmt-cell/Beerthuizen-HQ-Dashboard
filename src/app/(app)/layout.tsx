import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { MobieleNav } from "@/components/mobiele-nav";
import { SidebarNav, OnderaanNav } from "@/components/sidebar-nav";
import { BeheerMenu } from "@/components/beheer-menu";
import { Logo, LogoMark } from "@/components/logo";
import { areasFor, GROEPEN, isBeheer } from "@/lib/access";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Naast elkaar in plaats van na elkaar: het aantal ongelezen meldingen hangt
  // niet af van wie er inlogt, dus die query hoeft niet te wachten.
  const [user, unread] = await Promise.all([
    requireUser(),
    db.notification.count({ where: { readAt: null } }),
  ]);

  // De navigatie komt uit dezelfde lijst als de toegangscontrole, zodat er nooit
  // een link zichtbaar is die vervolgens geweigerd wordt.
  const zichtbaar = areasFor(user.role)
    .filter((area) => !area.buitenMenu)
    .map((area) => ({
      path: area.path,
      label: area.label,
      icon: area.icon,
      groep: area.groep,
      onderaan: area.onderaan,
    }));

  // Beheer — opbouw, tools, monitoring, instellingen — is geen werk en hoort
  // niet tussen de schermen waar je dagelijks heen gaat. Het zit achter het
  // tandwiel onderin, vlak boven je account.
  const links = zichtbaar.filter((area) => !isBeheer(area.groep));
  const beheerLinks = zichtbaar.filter((area) => isBeheer(area.groep));

  return (
    <div className="sterrenveld flex min-h-screen">
      {/* Af en toe een vallende ster door de achtergrond. Puur sfeer, dus
          aria-hidden: een schermlezer heeft niets aan drie lege blokjes. */}
      <div aria-hidden>
        <span className="vallende-ster" />
        <span className="vallende-ster" />
        <span className="vallende-ster" />
      </div>

      {/* Vast aan de zijkant met een eigen schuifbalk. Zonder dit groeit de balk
          mee met de pagina en staat de onderkant — je account, je meldingen —
          buiten beeld zodra een scherm langer is dan het venster. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto rand-rechts bg-bg-elevated md:flex">
        <div className="px-5 py-6">
          <Logo />
        </div>

        <SidebarNav links={links} groepen={GROEPEN} unread={unread} />

        {/* Vlak boven je account, vastgezet aan de onderkant van de balk. */}
        <div className="mt-auto space-y-1 px-3 pb-2">
          <OnderaanNav links={links} unread={unread} />
          <BeheerMenu links={beheerLinks} />
        </div>

        <div className="rand-boven p-4">
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
        {/* Op een telefoon alleen het merk bovenaan; navigeren doe je onderaan,
            waar je duim is. */}
        <header className="flex items-center gap-3 rand-onder px-4 py-3 md:hidden">
          <Link href="/hq">
            <LogoMark />
          </Link>
          <span className="text-sm font-semibold">Beerthuizen HQ</span>
        </header>

        {/* Ruimte onderaan voor de vaste balk, anders valt de laatste regel
            van elke pagina eronder. */}
        <main className="flex-1 px-5 py-6 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>

        <MobieleNav links={links} beheerLinks={beheerLinks} unread={unread} />
      </div>
    </div>
  );
}

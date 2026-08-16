"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/hq", label: "HQ", icon: "◆" },
  { href: "/agents", label: "Agents", icon: "◉" },
  { href: "/activiteit", label: "Activiteit", icon: "≡" },
  { href: "/instellingen", label: "Instellingen", icon: "⚙" },
] as const;

export function SidebarNav({ unread, compact = false }: { unread: number; compact?: boolean }) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (compact) {
    return (
      <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap ${
              isActive(link.href) ? "bg-surface text-text" : "text-text-muted"
            }`}
          >
            {link.label}
            {link.href === "/hq" && unread > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">{unread}</span>
            )}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive(link.href)
              ? "bg-surface font-medium text-text"
              : "text-text-muted hover:bg-surface-hover hover:text-text"
          }`}
        >
          <span className="w-4 text-center text-xs text-text-faint">{link.icon}</span>
          <span className="flex-1">{link.label}</span>
          {link.href === "/hq" && unread > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">
              {unread}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

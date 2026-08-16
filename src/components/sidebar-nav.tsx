"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { path: string; label: string; icon: string };

/// De badge hoort bij meldingen, niet bij HQ.
const BADGE_PATH = "/meldingen";

export function SidebarNav({
  links,
  unread,
  compact = false,
}: {
  links: NavLink[];
  unread: number;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  if (compact) {
    return (
      <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
        {links.map((link) => (
          <Link
            key={link.path}
            href={link.path}
            className={`rounded px-2.5 py-1.5 text-sm whitespace-nowrap ${
              isActive(link.path) ? "bg-surface text-text" : "text-text-muted"
            }`}
          >
            {link.label}
            {link.path === BADGE_PATH && unread > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">
                {unread}
              </span>
            )}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {links.map((link) => (
        <Link
          key={link.path}
          href={link.path}
          className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
            isActive(link.path)
              ? "bg-surface font-semibold text-text"
              : "text-text-muted hover:bg-surface-hover hover:text-text"
          }`}
        >
          <span className="w-4 text-center text-xs text-text-faint">{link.icon}</span>
          <span className="flex-1">{link.label}</span>
          {link.path === BADGE_PATH && unread > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

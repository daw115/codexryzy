"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavLinkProps = {
  href: string;
  label: string;
  icon: ReactNode;
};

export function NavLink({ href, label, icon }: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className={`navLink${active ? " navLinkActive" : ""}`}>
      <span className="navIcon">{icon}</span>
      <span className="navLabel">{label}</span>
    </Link>
  );
}

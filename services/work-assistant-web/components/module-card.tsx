import Link from "next/link";
import type { ReactNode } from "react";

type ModuleCardProps = {
  href: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  stats?: ReactNode;
};

export function ModuleCard({
  href,
  icon,
  eyebrow,
  title,
  description,
  stats,
}: ModuleCardProps) {
  return (
    <Link href={href} className="moduleCard">
      <div className="moduleCardTop">
        <span className="moduleIcon">{icon}</span>
        <span className="sectionEyebrow">{eyebrow}</span>
      </div>
      <h3 className="moduleTitle">{title}</h3>
      <p className="moduleCopy">{description}</p>
      {stats ? <div className="moduleStats">{stats}</div> : null}
    </Link>
  );
}

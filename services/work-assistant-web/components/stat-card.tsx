import type { ReactNode } from "react";

type StatCardProps = {
  eyebrow: string;
  value: string;
  detail: string;
  accent?: "ember" | "teal" | "gold" | "ink";
  children?: ReactNode;
};

export function StatCard({ eyebrow, value, detail, accent = "ink", children }: StatCardProps) {
  return (
    <section className={`statCard accent-${accent}`}>
      <div className="statTop">
        <p className="statEyebrow">{eyebrow}</p>
        <span className="statPulse" />
      </div>
      <div className="statValue">{value}</div>
      <p className="statDetail">{detail}</p>
      {children ? <div className="statMeta">{children}</div> : null}
    </section>
  );
}

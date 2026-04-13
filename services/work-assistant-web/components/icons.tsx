import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    />
  );
}

export function LogoIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7.5A3.5 3.5 0 0 1 7.5 4H12v16H7.5A3.5 3.5 0 0 1 4 16.5z" />
      <path d="M12 4h4.5A3.5 3.5 0 0 1 20 7.5v9a3.5 3.5 0 0 1-3.5 3.5H12" />
      <path d="M8 9h1.5" />
      <path d="M8 13h1.5" />
    </BaseIcon>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="2" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    </BaseIcon>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m5.5 8 6.5 4.5L18.5 8" />
    </BaseIcon>
  );
}

export function BotIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="7" width="14" height="11" rx="4" />
      <path d="M12 3v4" />
      <path d="M8.5 12h.01" />
      <path d="M15.5 12h.01" />
      <path d="M9 16c.9.7 1.9 1 3 1s2.1-.3 3-1" />
    </BaseIcon>
  );
}

export function TasksIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m8 7 1.6 1.8L13 5.5" />
      <path d="m8 13 1.6 1.8L13 11.5" />
      <path d="m8 19 1.6 1.8L13 17.5" />
      <path d="M15.5 7H20" />
      <path d="M15.5 13H20" />
      <path d="M15.5 19H20" />
    </BaseIcon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
    </BaseIcon>
  );
}

export function KnowledgeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H20v13.5A2.5 2.5 0 0 0 17.5 15H5z" />
      <path d="M5 6.5v11A2.5 2.5 0 0 0 7.5 20H20" />
      <path d="M9 8.5h7" />
      <path d="M9 12h7" />
    </BaseIcon>
  );
}

export function MeetingIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="6" width="11" height="12" rx="3" />
      <path d="m15 10 5-3v10l-5-3" />
      <path d="M8 10h3" />
      <path d="M8 14h4" />
    </BaseIcon>
  );
}

export function CerebroIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 4.5A3.5 3.5 0 0 0 5.5 8v8A3.5 3.5 0 0 0 9 19.5h6A3.5 3.5 0 0 0 18.5 16V8A3.5 3.5 0 0 0 15 4.5z" />
      <path d="M9 9h6" />
      <path d="M9 13h3.5" />
      <path d="M12.5 13h2" />
      <path d="M8 2.5v2" />
      <path d="M16 2.5v2" />
      <path d="M3.5 10h2" />
      <path d="M18.5 10h2" />
    </BaseIcon>
  );
}

export function OperationsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v3" />
      <path d="M12 18.5v3" />
      <path d="m4.9 4.9 2.1 2.1" />
      <path d="m17 17 2.1 2.1" />
      <path d="M2.5 12h3" />
      <path d="M18.5 12h3" />
      <path d="m4.9 19.1 2.1-2.1" />
      <path d="m17 7 2.1-2.1" />
    </BaseIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2" />
    </BaseIcon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 10a5 5 0 1 1 10 0v3.2l1.5 2.3H5.5L7 13.2z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </BaseIcon>
  );
}

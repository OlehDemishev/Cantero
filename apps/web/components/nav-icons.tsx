import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.5" />
    </Icon>
  );
}

export function ProjectsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2.5 6.25a1.5 1.5 0 0 1 1.5-1.5h3.1l1.4 1.75H16a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5v-7.75Z" />
    </Icon>
  );
}

export function ClientsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="6.5" r="2.5" />
      <path d="M2.5 17c0-2.9 2.1-4.75 4.5-4.75S11.5 14.1 11.5 17" />
      <circle cx="14" cy="7" r="2" />
      <path d="M13 12.5c2 .2 3.5 1.8 3.5 4.5" />
    </Icon>
  );
}

export function RateCatalogIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 3.5h9.5A1.5 1.5 0 0 1 15 5v11.5H5.5A1.5 1.5 0 0 1 4 15V3.5Z" />
      <path d="M4 3.5A1.5 1.5 0 0 0 2.5 5v10A1.5 1.5 0 0 0 4 16.5" />
      <path d="M7 7.5h5M7 10.5h5" />
    </Icon>
  );
}

export function WarehousesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M2.5 8.5 10 3l7.5 5.5V16a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V8.5Z" />
      <path d="M7.5 17v-5h5v5" />
    </Icon>
  );
}

export function SuppliersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="6" width="8.5" height="7" rx="1" />
      <path d="M11 8.5h3l2.5 2.5V13h-5.5" />
      <circle cx="6" cy="14.5" r="1.5" />
      <circle cx="13.5" cy="14.5" r="1.5" />
    </Icon>
  );
}

export function PurchaseOrdersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 3.5h9v13.5H6a2 2 0 0 1-2-2V3.5Z" />
      <path d="M13 3.5h1.5A1.5 1.5 0 0 1 16 5v10a2 2 0 0 1-2 2" />
      <path d="M7 7.5h4M7 10.5h4M7 13.5h2.5" />
    </Icon>
  );
}

export function InvoicesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 2.5h7l3 3V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
      <path d="M7 8.5h6M7 11.5h6M7 14.5h3.5" />
    </Icon>
  );
}

export function TeamIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="6.5" cy="6" r="2.25" />
      <circle cx="13.5" cy="6" r="2.25" />
      <path d="M2.5 17c0-2.6 1.9-4.5 4-4.5s4 1.9 4 4.5" />
      <path d="M9.5 12.7c.9-.6 2-.2 4-.2 2.1 0 4 1.9 4 4.5" />
    </Icon>
  );
}

export function ReportsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 17V3" />
      <path d="M3 17h14" />
      <path d="M6 14V9M10 14V6M14 14v-3.5" />
    </Icon>
  );
}

export function PortfolioIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10 2 2.5 6 10 10l7.5-4L10 2Z" />
      <path d="M2.5 10 10 14l7.5-4" />
      <path d="M2.5 14 10 18l7.5-4" />
    </Icon>
  );
}

export function DocumentsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 2.5h6l4 4V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
      <path d="M11 2.5V6a1 1 0 0 0 1 1h3" />
      <path d="M7 10.5h6M7 13.5h6" />
    </Icon>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 3v2M10 15v2M17 10h-2M5 10H3M14.66 5.34l-1.42 1.42M6.76 13.24l-1.42 1.42M14.66 14.66l-1.42-1.42M6.76 6.76 5.34 5.34" />
    </Icon>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="9" r="6" />
      <path d="M17.5 17.5 13.5 13.5" />
    </Icon>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10 2.5c-2.5 0-4.25 2-4.25 4.5v2.5c0 .8-.3 1.6-.85 2.2L4 12.75h12l-.9-1.05c-.55-.6-.85-1.4-.85-2.2V7c0-2.5-1.75-4.5-4.25-4.5Z" />
      <path d="M8.25 15.5a1.9 1.9 0 0 0 3.5 0" />
    </Icon>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width={16} height={16} viewBox="0 0 16 16" {...props}>
      <path d="M4 6.5 8 10.5 12 6.5" />
    </Icon>
  );
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </Icon>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" />
    </Icon>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />
    </Icon>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M16.5 11.8A6.7 6.7 0 0 1 8.2 3.5a6.7 6.7 0 1 0 8.3 8.3Z" />
    </Icon>
  );
}

export function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7.5 17H4.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3" />
      <path d="M13 13.5 17 10l-4-3.5M17 10H7.5" />
    </Icon>
  );
}

export function UserCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="10" cy="8.25" r="2.25" />
      <path d="M4.8 15.5c.8-2 2.7-3.25 5.2-3.25s4.4 1.25 5.2 3.25" />
    </Icon>
  );
}

export function EquipmentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12.5 3.5a3.5 3.5 0 0 0-4.6 4.1L3 12.5V17h4.5l4.9-4.9a3.5 3.5 0 0 0 4.1-4.6l-2.6 2.6-2-2 2.6-2.6Z" />
    </Icon>
  );
}

export function ResourcePlanningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4" width="15" height="13.5" rx="1.5" />
      <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" />
      <path d="M6 11.5l1.5 1.5 3-3M11.5 12.5h3" />
    </Icon>
  );
}

export function TemplatesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </Icon>
  );
}

export function SubcontractorsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M2 17c0-2.8 1.8-4.5 4-4.5s4 1.7 4 4.5" />
      <path d="M13 3.5a2 2 0 0 1 0 4M17.5 17c0-2.3-1.4-3.8-3.5-4.2" />
    </Icon>
  );
}

export function ExpensesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5" width="15" height="10.5" rx="1.5" />
      <path d="M2.5 8.5h15" />
      <circle cx="14" cy="12" r="1.5" />
    </Icon>
  );
}

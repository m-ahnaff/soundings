import Link from "next/link";
import { Suspense } from "react";
import { getIdentity, getMe } from "@/lib/api-server";
import { IS_DEMO } from "@/lib/env";
import { LogoMark } from "@/components/icons";
import { SidebarLinks, SidebarLive } from "@/components/shell/sidebar-client";
import {
  AccountMenu,
  CreateButton,
  DemoBar,
  GlobalSearch,
  MenuButton,
  UtilityButtons,
} from "@/components/shell/top-nav-client";

export function TopNav() {
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg px-2 sm:px-3">
      <MenuButton />
      <Link href="/" className="flex h-8 items-center gap-2 rounded-[3px] px-1.5 hover:bg-hover">
        <LogoMark size={24} />
        <span className="text-[16px] font-semibold tracking-[-0.01em]">Soundings</span>
      </Link>
      <div className="ml-1 sm:ml-3">
        <CreateButton />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <GlobalSearch />
        <UtilityButtons />
        <Suspense fallback={<span className="size-8 rounded-full" aria-hidden="true" />}>
          <Account />
        </Suspense>
      </div>
    </header>
  );
}

async function Account() {
  const [me, identity] = await Promise.all([getMe(), getIdentity()]);
  return <AccountMenu me={me} demoRole={identity.demoRole} />;
}

export function Sidebar() {
  return (
    <aside
      id="project-nav"
      aria-label="Project navigation"
      className="sidebar-panel shrink-0 overflow-hidden border-r border-line bg-sunken md:w-[240px] md:transition-[width] md:duration-150"
    >
      <Suspense fallback={<SidebarLinks active={null} isAdmin={false} />}>
        <SidebarLoader />
      </Suspense>
    </aside>
  );
}

async function SidebarLoader() {
  const me = await getMe();
  return <SidebarLive isAdmin={me?.role === "admin"} />;
}

export async function DemoStrip() {
  if (!IS_DEMO) return null;
  const identity = await getIdentity();
  return <DemoBar role={identity.demoRole ?? "anon"} />;
}

export function DemoStripShell() {
  return <div className="h-9 border-b border-line bg-[var(--lz-blue-bg)]" aria-hidden="true" />;
}

/** Breadcrumb + title row used at the top of every page. */
export function PageHeader({
  crumbs,
  title,
  actions,
}: {
  crumbs: { label: string; href?: string }[];
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="px-4 pt-5 pb-4 sm:px-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-[14px] text-fg-subtlest">
          {crumbs.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true">/</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-fg hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] leading-7 font-medium tracking-[-0.01em]">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

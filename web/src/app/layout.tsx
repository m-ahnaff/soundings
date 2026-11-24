import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { CreateDialog } from "@/components/shell/create-dialog";
import { DemoStrip, DemoStripShell, Sidebar, TopNav } from "@/components/shell/shell";
import { Shortcuts } from "@/components/shell/shortcuts";
import { DrawerScrim, ExpandSidebarButton } from "@/components/shell/sidebar-client";
import { Toaster } from "@/components/toaster";
import { BOARD_NAME, IS_DEMO } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `Board · ${BOARD_NAME} · Soundings`, template: `%s · ${BOARD_NAME} · Soundings` },
  description: `Request features, report bugs and follow the ${BOARD_NAME} roadmap.`,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1f24" },
  ],
};

// Runs before first paint: theme (stored, else OS) and sidebar state, so neither flashes or shifts.
const BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.setAttribute("data-theme",t);if(localStorage.getItem("sidebar")==="collapsed")d.setAttribute("data-sidebar","collapsed")}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className="antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden">
        <Toaster>
          <a
            href="#main"
            className="sr-only z-[70] rounded-[3px] bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            Skip to content
          </a>
          {IS_DEMO && (
            <Suspense fallback={<DemoStripShell />}>
              <DemoStrip />
            </Suspense>
          )}
          <TopNav />
          <div className="relative flex min-h-0 flex-1">
            <Sidebar />
            <DrawerScrim />
            <ExpandSidebarButton />
            <main id="main" className="min-w-0 flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
          <CreateDialog />
          <Shortcuts />
        </Toaster>
      </body>
    </html>
  );
}

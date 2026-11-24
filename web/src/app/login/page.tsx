import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { LogoMark } from "@/components/icons";
import { BOARD_NAME, IS_DEMO } from "@/lib/env";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <div className="flex justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-[400px] rounded-[3px] bg-bg px-6 py-8 shadow-overlay sm:px-10">
        <div className="flex flex-col items-center text-center">
          <LogoMark size={32} />
          <h1 className="mt-3 text-[16px] font-semibold">Log in to continue</h1>
          <p className="mt-1 text-[14px] text-fg-subtle">{BOARD_NAME} feedback on Soundings</p>
        </div>
        <div className="mt-6">
          {IS_DEMO ? (
            <div className="rounded-[3px] bg-sunken px-4 py-4 text-[14px] text-fg-subtle">
              <p>
                Accounts are off in this demo workspace. Use{" "}
                <span className="font-semibold text-fg">View as</span> in the blue bar at the top to act as a
                member or an admin.
              </p>
              <Link href="/" className="mt-3 inline-block font-medium text-link hover:underline">
                Back to the board
              </Link>
            </div>
          ) : (
            <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
              <LoginForm />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

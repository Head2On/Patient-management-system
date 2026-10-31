import * as React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — CareDesk",
  description: "Sign in to access your clinic workspace",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        {children}
      </div>
    </main>
  );
}

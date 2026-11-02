import * as React from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="w-full max-w-md h-[420px] rounded-lg border border-slate-200 bg-white p-6 shadow-sm animate-pulse" />
      }
    >
      <LoginForm />
    </React.Suspense>
  );
}

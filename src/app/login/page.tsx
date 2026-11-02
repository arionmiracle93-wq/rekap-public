import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-[#f4f4fb] p-5">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}

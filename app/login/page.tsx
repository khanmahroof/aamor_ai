import { AuthForm } from "@/components/auth-form";
import { googleEnabled } from "@/lib/auth/options";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      {error && (
        <div role="alert" className="error">
          Sign-in was not completed. Use your existing sign-in method or try
          again.
        </div>
      )}
      <AuthForm google={googleEnabled} />
    </>
  );
}

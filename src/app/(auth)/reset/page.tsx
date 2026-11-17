import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Choose a new password" };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <AuthForm mode="reset" token={(await searchParams).token ?? ""} />;
}

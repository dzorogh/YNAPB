import { redirect } from "next/navigation";

import { getProfile } from "@/lib/repositories/profile-repo";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const hasYnabConnection = (
  profile: Awaited<ReturnType<typeof getProfile>>,
): boolean =>
  Boolean(
    profile?.ynab_budget_id && profile?.ynab_token_ct && profile?.ynab_token_iv,
  );

export default async function HomePage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile(user.id);
  redirect(hasYnabConnection(profile) ? "/plan" : "/settings");
}

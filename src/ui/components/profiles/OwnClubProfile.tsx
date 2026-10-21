"use client";
import { useEngineLoad } from "@/ui/useEngineLoad";
import { useSeeAll } from "@/ui/dev";
import { useT } from "@/ui/i18n/LocaleProvider";
import { ClubProfile } from "@/ui/components/profiles/ClubProfile";

/** A ficha do clube do gamer, inteira (`/club/`) ou só com o plantel (`/squad/`). */
export function OwnClubProfile({ club, squadOnly }: { club: string; squadOnly?: boolean }) {
  const { t } = useT();
  const [seeAll] = useSeeAll();
  const d = useEngineLoad((engine) => engine.call("clubProfile", { id: club, seeAll }), [club, seeAll]);
  if (d === undefined) return <p>{t("profile.loading")}</p>;
  if (d === null) return <p className="erro">{t("profile.notFound")}</p>;
  return <ClubProfile d={d} seeAll={seeAll} {...(squadOnly ? { squadOnly } : {})} />;
}

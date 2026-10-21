"use client";
import { Suspense } from "react";
import { WithClub } from "@/ui/components/WithClub";
import { OwnClubProfile } from "@/ui/components/profiles/OwnClubProfile";

/** Clube (RZ-145): a ficha do clube do gamer. */
export default function ClubPage() {
  return <Suspense fallback={null}><WithClub title="">{(c) => <OwnClubProfile club={c} />}</WithClub></Suspense>;
}

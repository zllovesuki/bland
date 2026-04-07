import { getRouteApi } from "@tanstack/react-router";
import { SharedPageView } from "@/client/components/shared-page-view";

const shareRoute = getRouteApi("/s/$token");

export function SharedPageRoute() {
  const params = shareRoute.useParams();
  const search = shareRoute.useSearch();

  return <SharedPageView token={params.token} activePage={search.page} />;
}

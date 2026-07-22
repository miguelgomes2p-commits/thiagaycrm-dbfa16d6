import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep data fresh for 30s so remounting a route doesn't refetch immediately.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload route chunks + loaders on link hover/focus for instant navigation.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Show a pending fallback quickly on slow transitions instead of freezing.
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
  });

  return router;
};

export const AUTH_ROUTES = ["/sign-in", "/sign-up"] as const;

export function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

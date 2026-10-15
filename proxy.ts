import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isAuthRoute } from "@/modules/auth/constants";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAuthRoute(pathname)) {
    return NextResponse.next();
  }

  const hasSession = !!getSessionCookie(request);

  if (!hasSession) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};

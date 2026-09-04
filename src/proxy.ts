import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth(function proxy(req) {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isChangePage = req.nextUrl.pathname === "/change-password";
  const userRole = req.auth?.user?.role;
  // SAMS-012: a credentials user with the force-password-change flag MUST be on
  // /change-password until the flag is cleared; direct-URL bypass is redirected
  // back. SSO users do not carry the flag (they authenticate via their IdP).
  const mustChange = req.auth?.user?.mustChangePassword === true;

  if (!isLoggedIn && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL(mustChange ? "/change-password" : "/", req.nextUrl.origin));
  }

  // Force-change gate — redirect BEFORE any other route is served.
  if (isLoggedIn && mustChange && !isChangePage) {
    return NextResponse.redirect(new URL("/change-password", req.nextUrl.origin));
  }
  // On /change-password but the flag is cleared/not set → no longer forced.
  if (isLoggedIn && isChangePage && !mustChange) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  const isAdminRoute = req.nextUrl.pathname.startsWith("/admin");
  if (isAdminRoute && userRole !== "Admin") {
    const homeUrl = new URL("/", req.nextUrl.origin);
    return NextResponse.redirect(homeUrl);
  }

  // SAMS-005: the Client Portal uses simplified chrome (no admin/operator nav).
  // Signal to the root layout (server) that the request is a portal route so it
  // can skip the NavBar/MobileNav; the portal layout renders its own header.
  const requestHeaders = new Headers(req.headers);
  if (req.nextUrl.pathname.startsWith("/portal")) {
    requestHeaders.set("x-portal-route", "1");
  }
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) {
    requestHeaders.set("host", forwardedHost);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};

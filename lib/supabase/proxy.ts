import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/", "/api/auth/signup", "/api/auth/signin"];

export async function updateSession(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
        },
      },
    },
  );

  // Refresh the session
  const { data, error } = (await supabase.auth.getSession()) as {
    data: { session: any };
    error: Error | null;
  };

  // Check if the current path is public
  const { pathname } = new URL(request.url);
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!isPublicPath) {
    // Guard: redirect unauthenticated users to login
    if (!data?.session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  const response = NextResponse.next({ request });

  // Set session cookies from the supabase response
  response.cookies.set(
    "sb:refresh-token",
    data.session?.refresh_token ?? "",
  );
  response.cookies.set(
    "sb:access-token",
    data.session?.access_token ?? "",
  );
  response.cookies.set(
    "sb:expires-at",
    data.session?.expires_at ?? "",
  );

  return response;
}
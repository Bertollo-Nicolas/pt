import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { parseWorkspacePath } from '@/lib/workspace-navigation';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const redirect=(url:URL)=>{
    const response=NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach(cookie=>response.cookies.set(cookie));
    return response;
  };

  // Redirect unauthenticated users to /login (except /login itself and /api/*)
  if (!user && pathname !== '/login' && !pathname.startsWith('/api/')) {
    const login=new URL('/login',request.url);
    const destination=parseWorkspacePath(request.nextUrl.pathname+request.nextUrl.search);
    if(destination)login.searchParams.set('next',destination.path);
    return redirect(login);
  }

  // Redirect already-authenticated users away from /login
  if (user && pathname === '/login') {
    const destination=parseWorkspacePath(request.nextUrl.searchParams.get('next')??'/');
    return redirect(new URL(destination?.path??'/', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|audio/).*)'],
};

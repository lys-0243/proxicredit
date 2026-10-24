import { NextResponse, type NextRequest } from "next/server";

/** Redirige vers la connexion quand aucune session n'existe. La vérification réelle des droits
 * est faite par l'API : ce garde évite seulement d'afficher des pages vides. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const connecte = request.cookies.has("pc_session");

  if (pathname.startsWith("/connexion")) {
    return connecte ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!connecte) {
    const url = new URL("/connexion", request.url);
    url.searchParams.set("suite", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:png|svg|jpg|ico)$).*)"],
};

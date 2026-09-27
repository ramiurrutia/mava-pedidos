// A fallback for an installation whose service worker is not yet controlling it.
// Files are received locally by sw.js; never silently discard them on the server.
export function POST(request: Request) {
  return Response.redirect(new URL("/compartir?error=worker", request.url), 303);
}

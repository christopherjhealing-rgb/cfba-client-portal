// The portal's one Google Maps JavaScript API bootstrap. Everything that
// wants a Maps library — the address autocomplete on Lodge a job, the aerial
// underlay on the site plan tool — comes through here, so the script is
// fetched at most once per page however many components ask for it.
//
// The key is optional by design. With no NEXT_PUBLIC_GOOGLE_MAPS_KEY, a
// blocked script or a Google wobble, every call resolves to null and the
// caller falls back to whatever it does without Google. A missing optional
// key must never surface to a client.

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

type ImportLibrary = (name: string) => Promise<unknown>;
type MapsNamespace = Record<string, unknown> & { importLibrary?: ImportLibrary };
type MapsWindow = { google?: { maps?: MapsNamespace } };

/** One bootstrap per page, shared by every caller. */
let bootOnce: Promise<ImportLibrary | null> | null = null;

async function boot(): Promise<ImportLibrary | null> {
  if (!GOOGLE_MAPS_KEY || typeof window === "undefined") return null;
  try {
    const w = window as unknown as MapsWindow;
    const g = (w.google ??= {});
    const maps: MapsNamespace = (g.maps ??= {});

    if (!maps.importLibrary) {
      // Google's dynamic bootstrap, written out readably: park a stub that
      // injects the real script on first use. The script replaces the stub
      // with the real importLibrary, which the stub then defers to.
      let script: Promise<void> | null = null;
      const inject = () =>
        (script ??= new Promise<void>((resolve, reject) => {
          const params = new URLSearchParams({
            key: GOOGLE_MAPS_KEY,
            v: "weekly",
            libraries: "places",
            loading: "async",
            callback: "google.maps.__boot__",
          });
          maps.__boot__ = resolve;
          const s = document.createElement("script");
          s.src = "https://maps.googleapis.com/maps/api/js?" + params.toString();
          s.async = true;
          s.onerror = () => reject(new Error("Google Maps script failed to load"));
          const nonced = document.querySelector<HTMLScriptElement>("script[nonce]");
          if (nonced?.nonce) s.nonce = nonced.nonce;
          document.head.append(s);
        }));
      const stub: ImportLibrary = (name) =>
        inject().then(() => {
          const real = w.google?.maps?.importLibrary;
          if (!real || real === stub) throw new Error("Maps bootstrap incomplete");
          return real(name);
        });
      maps.importLibrary = stub;
    }

    return maps.importLibrary;
  } catch {
    return null;
  }
}

/** Resolves a Maps library ("places", "maps", "geocoding", …), or null when
 *  there's no key or Google can't be reached. Callers treat null as "do
 *  today's job without Google" — never as an error worth showing. */
export async function loadMapsLibrary<T>(name: string): Promise<T | null> {
  bootOnce ??= boot();
  try {
    const importLibrary = await bootOnce;
    if (!importLibrary) return null;
    return ((await importLibrary(name)) as T) ?? null;
  } catch {
    return null;
  }
}

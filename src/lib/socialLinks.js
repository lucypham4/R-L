// A chef's links: where else clients can find them. One per platform,
// shown on their profile and their public page.
//
// What's stored is a handle (for the social platforms) or an address (for
// a website), never a ready-made href. The href is built here, on the way
// out, every time: the row is the chef's to write, so anything in it could
// be anything, and it ends up as a link on a page strangers open. Nothing
// becomes an href unless it parses as one of these.

const HANDLE = /^[A-Za-z0-9._-]{1,64}$/;

function socialPlatform({ key, label, hosts, href, pathPrefix = '' }) {
  return {
    key,
    label,
    placeholder: '@yourname',
    // "@ana", "ana", or a link to the profile, pasted from the app.
    parse(input) {
      let handle = input.trim();
      const asUrl = toUrl(handle);
      if (asUrl && hosts.includes(asUrl.hostname.replace(/^(www|m)\./, ''))) {
        const first = asUrl.pathname.split('/').filter(Boolean)[0] ?? '';
        // youtube.com/channel/UC… is a channel, not a handle: only take
        // the path where the platform puts handles.
        if (!first.startsWith(pathPrefix)) return null;
        handle = first;
      }
      handle = handle.replace(/^@/, '');
      return HANDLE.test(handle) ? handle : null;
    },
    href: (handle) => (HANDLE.test(handle) ? href(encodeURIComponent(handle)) : null),
    text: (handle) => `@${handle}`,
  };
}

function toUrl(input) {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export const PLATFORMS = [
  socialPlatform({
    key: 'instagram',
    label: 'Instagram',
    hosts: ['instagram.com'],
    href: (h) => `https://instagram.com/${h}`,
  }),
  socialPlatform({
    key: 'tiktok',
    label: 'TikTok',
    hosts: ['tiktok.com'],
    pathPrefix: '@',
    href: (h) => `https://www.tiktok.com/@${h}`,
  }),
  socialPlatform({
    key: 'youtube',
    label: 'YouTube',
    hosts: ['youtube.com'],
    pathPrefix: '@',
    href: (h) => `https://www.youtube.com/@${h}`,
  }),
  {
    key: 'website',
    label: 'Website',
    placeholder: 'yourname.com',
    parse(input) {
      const url = toUrl(input.trim());
      // A bare word isn't an address: "ana" would otherwise become
      // https://ana/.
      return url && url.hostname.includes('.') ? url.href : null;
    },
    href(value) {
      const url = toUrl(value);
      return url ? url.href : null;
    },
    text(value) {
      const url = toUrl(value);
      return url ? `${url.hostname.replace(/^www\./, '')}${url.pathname}`.replace(/\/$/, '') : '';
    },
  },
];

const BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]));

/**
 * What a chef typed for one platform, made ready to store: the handle or
 * address, '' for nothing, or null when it isn't recognisable as one.
 */
export function parseLink(key, input) {
  if (!input.trim()) return '';
  return BY_KEY[key].parse(input);
}

/** The links worth showing, in platform order, each with its href. */
export function linksToShow(links) {
  return PLATFORMS.flatMap((platform) => {
    const value = links?.[platform.key];
    if (typeof value !== 'string' || !value) return [];
    const href = platform.href(value);
    return href ? [{ key: platform.key, label: platform.label, href, text: platform.text(value) }] : [];
  });
}

/** Keeps only the platforms we know, with string values: a stored row, cleaned. */
export function cleanLinks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    PLATFORMS.filter((p) => typeof raw[p.key] === 'string' && raw[p.key]).map((p) => [p.key, raw[p.key]])
  );
}

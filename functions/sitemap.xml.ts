import type { Env, PagesFunction } from './lib/types';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    "SELECT slug FROM products WHERE status='published' AND (release_at IS NULL OR release_at <= ?)",
  )
    .bind(Math.floor(Date.now() / 1000))
    .all<{ slug: string }>();
  const urls = [
    `${env.SITE_URL}/`,
    `${env.SITE_URL}/privacy.html`,
    `${env.SITE_URL}/terms.html`,
    ...results.map(
      ({ slug }) =>
        `${env.SITE_URL}/product.html?slug=${encodeURIComponent(slug)}`,
    ),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url.replaceAll('&', '&amp;')}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

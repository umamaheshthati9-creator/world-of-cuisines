// Runs on every request. For a recipe URL like /world-kitchens/braised-tofu-soup,
// it looks the recipe up in Supabase and swaps in that recipe's own title,
// description, and photo before the page is sent out — so link previews on
// Bluesky, Flipboard, WhatsApp, etc. show the real dish, not a generic banner.
// Everything else (any other path, or a recipe that isn't found) is left untouched.

const SUPABASE_URL = "https://dvaxmxouxfpmeydebffk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_GUFW4xa8SNOm1ncjm5SGwQ_l79hrAQE";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

export default async (request, context) => {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  // Only recipe-shaped paths get special treatment: /<category-slug>/<recipe-slug>
  if (parts.length !== 2) {
    return context.next();
  }

  const slug = parts[1];
  let recipe = null;

  try {
    const apiUrl =
      SUPABASE_URL +
      "/rest/v1/recipes?select=data&data->>slug=eq." +
      encodeURIComponent(slug) +
      "&limit=1";
    const res = await fetch(apiUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY
      }
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows && rows[0] && rows[0].data) recipe = rows[0].data;
    }
  } catch (e) {
    // Network hiccup or Supabase down — fall through and just serve the normal page.
  }

  const response = await context.next();
  if (!recipe) return response;

  let html = await response.text();

  const title = escapeHtml(recipe.title || "World of Cuisines");
  const description = escapeHtml(
    recipe.description || "A recipe from World of Cuisines."
  );
  // Uploaded photos are stored as data: URIs, which most crawlers can't fetch as
  // an image — only a recipe with a real pasted image URL gets its own preview photo.
  const hasRealImageUrl = recipe.coverImage && /^https?:\/\//.test(recipe.coverImage);
  const image = hasRealImageUrl ? recipe.coverImage : "https://worldofcuisiness.netlify.app/og-image.jpg";
  const pageUrl = url.origin + url.pathname;

  html = replaceTag(html, /<title>.*?<\/title>/, `<title>${title} — World of Cuisines</title>`);
  html = replaceTag(html, /<meta name="description" content=".*?">/, `<meta name="description" content="${description}">`);
  html = replaceTag(html, /<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${title}">`);
  html = replaceTag(html, /<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${description}">`);
  html = replaceTag(html, /<meta property="og:image" content=".*?">/, `<meta property="og:image" content="${image}">`);
  html = replaceTag(html, /<meta property="og:url" content=".*?">/, `<meta property="og:url" content="${pageUrl}">`);
  html = replaceTag(html, /<meta name="twitter:title" content=".*?">/, `<meta name="twitter:title" content="${title}">`);
  html = replaceTag(html, /<meta name="twitter:description" content=".*?">/, `<meta name="twitter:description" content="${description}">`);
  html = replaceTag(html, /<meta name="twitter:image" content=".*?">/, `<meta name="twitter:image" content="${image}">`);

  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(html, { status: response.status, headers });
};

export const config = { path: "/*" };

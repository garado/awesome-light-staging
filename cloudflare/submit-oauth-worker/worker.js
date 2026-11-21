// awesome-light-staging submit portal - OAuth code exchange proxy.
//
// This Worker's ONLY job is the one step a static page can't do safely: trading
// an OAuth `code` for an access token, which requires CLIENT_SECRET. It never
// touches GitHub on its own behalf - the browser uses the token it gets back
// to call the GitHub API directly, authenticated as the signed-in user. No
// state is stored here; there is nothing to persist.
//
// Deploy: paste into a new Cloudflare Worker, then set secrets under
// Settings -> Variables -> Add variable (encrypted):
//   CLIENT_ID     = Ov23lifjO1KWm8keowOt
//   CLIENT_SECRET = <the secret from the GitHub OAuth App settings page>
//   ALLOWED_ORIGIN = https://awesome-light-staging.garado.dev

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "https://awesome-light-staging.garado.dev";

    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/exchange") {
      return handleExchange(request, env, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/refresh") {
      return handleRefresh(request, env, corsHeaders);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};

async function handleExchange(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected a JSON body." }, 400, corsHeaders);
  }

  const { code } = body;
  if (!code) {
    return json({ error: "Missing code." }, 400, corsHeaders);
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return json({ error: tokenData.error_description || tokenData.error }, 400, corsHeaders);
  }

  return json(
    {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      refresh_token_expires_in: tokenData.refresh_token_expires_in,
    },
    200,
    corsHeaders
  );
}

async function handleRefresh(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected a JSON body." }, 400, corsHeaders);
  }

  const { refresh_token } = body;
  if (!refresh_token) {
    return json({ error: "Missing refresh_token." }, 400, corsHeaders);
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token,
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return json({ error: tokenData.error_description || tokenData.error }, 400, corsHeaders);
  }

  return json(
    {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      refresh_token_expires_in: tokenData.refresh_token_expires_in,
    },
    200,
    corsHeaders
  );
}

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

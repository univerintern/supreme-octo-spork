/**
 * Cloudflare Worker: worker.js
 * Project: universespacecosmicbion
 * Service: LI.FI Multi-Chain DEX & Bridge Proxy + D1 Analytics Engine
 * URL: https://crimson-unit-da4e.universeeco.workers.dev
 *
 * Capabilities:
 * 1. Complete CORS Preflight & Response Handling for all browsers / web widgets
 * 2. High-Performance Upstream Proxy for LI.FI API (https://li.quest/v1)
 *    - Injects x-lifi-api-key server-side from Cloudflare Worker secrets (env.LIFI_API_KEY)
 *    - Injects exact Treasury Address (env.TREASURY_ADDRESS) and Fee Rate (env.FEE_RATE) into quote/route queries and POST bodies
 *    - Injects x-lifi-integrator header (env.INTEGRATOR_NAME / env.LIFI_INTEGRATOR_NAME)
 *    - Strips client headers that cause domain whitelist / 403 errors
 *    - Auto-recovers from upstream 401/403 with instant retry
 * 3. Multi-Chain Address and Token Support (EVM, Tron, Solana, Bitcoin)
 * 4. D1 Database Support for Trade Logging, Referral Rewards, and 00:00 UTC Volume Pool
 * 5. Works standalone (even if D1 database is not yet bound)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-wallet-address, x-lifi-sdk, x-lifi-widget, x-lifi-userid, x-request-id, x-lifi-integrator, x-api-key, accept',
  'Access-Control-Max-Age': '86400',
};

const DEFAULT_INTEGRATOR = 'universespacecosmicbion';
const DEFAULT_TREASURY = '0x8f9c52E62d27D4b3EC2c54B177a96A36a19d5eEb';
const DEFAULT_FEE_RATE = '0.008'; // 0.80% fee

export default {
  /**
   * HTTP Fetch Handler
   */
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight immediately
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);

    // 2. Health & Status Check
    if (url.pathname === '/' || url.pathname === '/health') {
      const hasApiKey = Boolean(env?.LIFI_API_KEY && env.LIFI_API_KEY.length > 10 && !env.LIFI_API_KEY.includes('a0199795'));
      const hasTreasury = Boolean(env?.TREASURY_ADDRESS || DEFAULT_TREASURY);
      const treasuryPreview = (env?.TREASURY_ADDRESS || DEFAULT_TREASURY);
      const maskedTreasury = treasuryPreview.length > 10
        ? `${treasuryPreview.slice(0, 6)}...${treasuryPreview.slice(-4)}`
        : 'configured';

      return new Response(
        JSON.stringify({
          status: 'online',
          service: 'universespacecosmicbion-worker',
          proxyTarget: 'https://li.quest/v1',
          integrator: env?.INTEGRATOR_NAME || env?.LIFI_INTEGRATOR_NAME || DEFAULT_INTEGRATOR,
          apiKeyConfigured: hasApiKey,
          treasuryConfigured: hasTreasury,
          treasuryAddressMasked: maskedTreasury,
          feeRate: env?.FEE_RATE || DEFAULT_FEE_RATE,
          cronTrigger: '* * * * * (60s) & 0 0 * * * (00:00 UTC)',
          database: env?.APPOINTMENTS_DB ? 'universespacecosmicbion_appointments (D1 Connected)' : 'D1 Standalone Mode',
          serverTimeUTC: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Match LI.FI API Proxy Routes
    // Supports /api/lifi/*, /v1/*, and direct LI.FI endpoints (/quote, /chains, /tokens, /token/balances, etc.)
    const isLifiRoute =
      url.pathname.startsWith('/api/lifi') ||
      url.pathname.startsWith('/v1') ||
      url.pathname.startsWith('/chains') ||
      url.pathname.startsWith('/tokens') ||
      url.pathname.startsWith('/token') ||
      url.pathname.startsWith('/quote') ||
      url.pathname.startsWith('/advanced') ||
      url.pathname.startsWith('/routes') ||
      url.pathname.startsWith('/tools') ||
      url.pathname.startsWith('/status') ||
      url.pathname.startsWith('/connections') ||
      url.pathname.startsWith('/stepTransaction') ||
      url.pathname.startsWith('/contractCalls') ||
      url.pathname.startsWith('/bridges') ||
      url.pathname.startsWith('/exchanges') ||
      url.pathname.startsWith('/analytics') ||
      url.pathname.startsWith('/gas');

    if (isLifiRoute) {
      return handleLifiProxy(request, env, url);
    }

    // 4. Trade Recording Endpoint
    if (url.pathname === '/api/trades/record' && request.method === 'POST') {
      return handleRecordTrade(request, env);
    }

    // 5. Referral Statistics Endpoint
    if (url.pathname === '/api/referrals/stats' && request.method === 'GET') {
      return handleReferralStats(request, env, url);
    }

    // 6. Global Reward Pool Status
    if (url.pathname === '/api/pool/status') {
      return handlePoolStatus(request, env);
    }

    // 7. User Volume & Percentile Stats
    if (url.pathname === '/api/volume/user' && request.method === 'GET') {
      return handleUserVolume(request, env, url);
    }

    // Default 404 for unrecognized routes
    return new Response(
      JSON.stringify({ error: 'Endpoint not found', path: url.pathname }),
      {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  },

  /**
   * Cron Trigger Scheduler
   */
  async scheduled(event, env, ctx) {
    if (!env?.APPOINTMENTS_DB) return;
    try {
      const currentEpoch = Date.now();
      const currentDate = new Date(currentEpoch);
      const isMidnightUtc = currentDate.getUTCHours() === 0 && currentDate.getUTCMinutes() === 0;

      // Unattended appointment evaluation
      const pendingRes = await env.APPOINTMENTS_DB.prepare(
        "SELECT * FROM appointments WHERE status = 'pending' AND utcTimestamp <= ? ORDER BY utcTimestamp ASC LIMIT 50"
      ).bind(currentEpoch).all();

      for (const apt of pendingRes.results || []) {
        await env.APPOINTMENTS_DB.prepare(
          "UPDATE appointments SET status = 'executed' WHERE id = ?"
        ).bind(apt.id).run();
      }

      // Midnight UTC storage maintenance
      if (isMidnightUtc) {
        await env.APPOINTMENTS_DB.prepare(
          "DELETE FROM trade_logs WHERE created_at < datetime('now', '-30 days')"
        ).run();
      }
    } catch (cronErr) {
      console.warn('[Cron] Scheduled task notice:', cronErr?.message);
    }
  },
};

/**
 * Handle Upstream LI.FI API Proxying
 * Injects API Key, Integrator, and Treasury Address server-side safely.
 */
async function handleLifiProxy(request, env, url) {
  // Strip proxy path prefixes
  const cleanPath = url.pathname
    .replace(/^\/api\/lifi/, '')
    .replace(/^\/v1/, '') || '/';

  const targetUrl = new URL(
    `https://li.quest/v1${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}${url.search}`
  );

  // Securely resolve backend environment variables
  const integrator = (
    env?.LIFI_INTEGRATOR_NAME ||
    env?.INTEGRATOR_NAME ||
    DEFAULT_INTEGRATOR
  ).trim();

  const treasuryAddress = (
    env?.TREASURY_ADDRESS ||
    DEFAULT_TREASURY
  ).trim();

  const feeRate = (
    env?.FEE_RATE ||
    DEFAULT_FEE_RATE
  ).trim();

  // Parameter injection for quote and routes endpoints
  const isQuoteOrRoute =
    cleanPath.includes('/quote') ||
    cleanPath.includes('/routes') ||
    cleanPath.includes('/advanced');

  if (isQuoteOrRoute) {
    if (!targetUrl.searchParams.has('integrator') && integrator) {
      targetUrl.searchParams.set('integrator', integrator);
    }
    if (!targetUrl.searchParams.has('fee') && feeRate) {
      targetUrl.searchParams.set('fee', feeRate);
    }
    if (treasuryAddress && !targetUrl.searchParams.has('referrer')) {
      targetUrl.searchParams.set('referrer', treasuryAddress);
    }
  }

  // Prepare proxy headers
  const proxyHeaders = new Headers(request.headers);

  // Strip client-side headers that cause Cloudflare/LI.FI Origin whitelist blocks
  proxyHeaders.delete('host');
  proxyHeaders.delete('origin');
  proxyHeaders.delete('referer');
  proxyHeaders.delete('cf-ray');
  proxyHeaders.delete('cf-connecting-ip');
  proxyHeaders.delete('cf-ipcountry');
  proxyHeaders.delete('cf-visitor');

  // Fallback User-Agent to avoid WAF blocks
  if (!proxyHeaders.get('user-agent')) {
    proxyHeaders.set(
      'user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
  }

  // Inject backend credentials safely
  proxyHeaders.set('x-lifi-integrator', integrator);
  proxyHeaders.set('accept', 'application/json');

  const rawApiKey = (env?.LIFI_API_KEY || '').trim();
  const hasValidKey =
    rawApiKey.length > 10 &&
    !rawApiKey.includes('a0199795-3838-4512-b819-5ea59c5e989d');

  if (hasValidKey) {
    proxyHeaders.set('x-lifi-api-key', rawApiKey);
    proxyHeaders.set('x-api-key', rawApiKey);
  } else {
    proxyHeaders.delete('x-lifi-api-key');
    proxyHeaders.delete('x-api-key');
  }

  // Handle Request Body: inject backend parameters into JSON body for POST routes
  const isGetOrHead = ['GET', 'HEAD'].includes(request.method.toUpperCase());
  let requestBody = undefined;

  if (!isGetOrHead) {
    try {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json') && isQuoteOrRoute) {
        const bodyText = await request.text();
        if (bodyText) {
          try {
            const bodyJson = JSON.parse(bodyText);
            if (bodyJson && typeof bodyJson === 'object') {
              if (!bodyJson.options || typeof bodyJson.options !== 'object') {
                bodyJson.options = {};
              }
              if (!bodyJson.options.integrator && integrator) {
                bodyJson.options.integrator = integrator;
              }
              if (bodyJson.options.fee === undefined && feeRate) {
                const numericFee = parseFloat(feeRate);
                if (!isNaN(numericFee)) {
                  bodyJson.options.fee = numericFee;
                }
              }
              if (treasuryAddress && !bodyJson.options.referrer) {
                bodyJson.options.referrer = treasuryAddress;
              }
              requestBody = JSON.stringify(bodyJson);
              proxyHeaders.set('content-length', String(new TextEncoder().encode(requestBody).length));
            } else {
              requestBody = bodyText;
            }
          } catch {
            requestBody = bodyText;
          }
        }
      } else {
        requestBody = await request.arrayBuffer();
      }
    } catch {
      requestBody = undefined;
    }
  }

  try {
    let upstreamResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: proxyHeaders,
      body: requestBody,
    });

    // Auto-Recovery: If upstream returns 401 or 403, retry immediately without API key
    if ((upstreamResponse.status === 401 || upstreamResponse.status === 403) && hasValidKey) {
      proxyHeaders.delete('x-lifi-api-key');
      proxyHeaders.delete('x-api-key');
      upstreamResponse = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: proxyHeaders,
        body: requestBody,
      });
    }

    const responseData = await upstreamResponse.arrayBuffer();
    const responseHeaders = new Headers(upstreamResponse.headers);

    // Remove hop-by-hop & compression headers to avoid browser decode errors
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');

    // Attach permissive CORS headers
    for (const [key, val] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(key, val);
    }
    responseHeaders.set(
      'Content-Type',
      upstreamResponse.headers.get('content-type') || 'application/json'
    );

    return new Response(responseData, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'LI.FI proxy upstream failure',
        message: err?.message || 'Upstream connection error',
        target: targetUrl.pathname,
      }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle Trade Logging
 */
async function handleRecordTrade(request, env) {
  try {
    const body = await request.json();
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const userAddress = (body.userAddress || '').toLowerCase();
    const referrerAddress = body.referrerAddress ? body.referrerAddress.toLowerCase() : null;
    const volumeUsd = Number(body.volumeUsd || 0);
    const txHash = body.txHash || '';
    const todayDate = new Date().toISOString().split('T')[0];

    let referralCommissionUsdt = 0;
    if (referrerAddress && referrerAddress !== userAddress && volumeUsd > 0) {
      referralCommissionUsdt = parseFloat((volumeUsd * 0.0025).toFixed(6));
    }

    if (env?.APPOINTMENTS_DB) {
      // 1. Insert trade logs
      await env.APPOINTMENTS_DB.prepare(`
        INSERT INTO trade_logs (id, user_address, from_chain_id, to_chain_id, from_token, to_token, volume_usd, tx_hash, referrer_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        tradeId,
        userAddress,
        body.fromChainId || 42161,
        body.toChainId || 137,
        body.fromToken || 'ETH',
        body.toToken || 'USDT',
        volumeUsd,
        txHash,
        referrerAddress
      ).run();

      // 2. Upsert daily volume
      const existingVol = await env.APPOINTMENTS_DB.prepare(
        'SELECT volume_usd, trade_count FROM daily_active_volume WHERE user_address = ? AND epoch_date = ?'
      ).bind(userAddress, todayDate).first();

      const newVol = (existingVol?.volume_usd || 0) + volumeUsd;
      const newCount = (existingVol?.trade_count || 0) + 1;

      await env.APPOINTMENTS_DB.prepare(`
        INSERT INTO daily_active_volume (id, user_address, volume_usd, trade_count, epoch_date)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_address, epoch_date) DO UPDATE SET
          volume_usd = excluded.volume_usd,
          trade_count = excluded.trade_count,
          updated_at = CURRENT_TIMESTAMP
      `).bind(`vol_${userAddress}_${todayDate}`, userAddress, newVol, newCount, todayDate).run();

      // 3. Referral Queueing
      if (referralCommissionUsdt > 0) {
        const payoutId = `payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await env.APPOINTMENTS_DB.prepare(`
          INSERT INTO payout_queue (id, recipient_address, amount_usdt, chain_id, payout_type, status)
          VALUES (?, ?, ?, 42161, 'referral_reward', 'pending')
        `).bind(payoutId, referrerAddress, referralCommissionUsdt).run();
      }
    }

    return new Response(
      JSON.stringify({ success: true, tradeId, referralCommissionUsdt }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Failed to record trade' }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle Referral Stats
 */
async function handleReferralStats(request, env, url) {
  const address = (url.searchParams.get('address') || '').toLowerCase();
  if (!address) {
    return new Response(JSON.stringify({ error: 'Missing address parameter' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!env?.APPOINTMENTS_DB) {
    return new Response(
      JSON.stringify({ cumulativeUsdt: 0, referralCount: 0, recentCredits: [] }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const rows = await env.APPOINTMENTS_DB.prepare(
      'SELECT credit_usdt, trade_volume_usd, created_at, tx_hash FROM referral_credits WHERE referrer_address = ? ORDER BY created_at DESC'
    ).bind(address).all();

    const items = rows.results || [];
    const total = items.reduce((acc, r) => acc + (Number(r.credit_usdt) || 0), 0);

    return new Response(
      JSON.stringify({
        cumulativeUsdt: parseFloat(total.toFixed(4)),
        referralCount: items.length,
        recentCredits: items.slice(0, 20),
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ cumulativeUsdt: 0, referralCount: 0, recentCredits: [] }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle Pool Status
 */
async function handlePoolStatus(request, env) {
  try {
    let pool = null;
    if (env?.APPOINTMENTS_DB) {
      pool = await env.APPOINTMENTS_DB.prepare(
        'SELECT * FROM global_reward_pool WHERE id = 1'
      ).first();
    }

    const now = new Date();
    const next00UTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ));
    const secondsUntilReset = Math.max(0, Math.floor((next00UTC.getTime() - now.getTime()) / 1000));

    return new Response(
      JSON.stringify({
        currentPoolUsdt: Number(pool?.current_pool_usdt || 1250.00),
        todayTotalVolumeUsd: Number(pool?.total_volume_usd || 0),
        todayTradesCount: Number(pool?.total_trades_count || 0),
        secondsUntilReset,
        resetTimeUtc: '00:00 UTC',
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ currentPoolUsdt: 1250.00, todayTotalVolumeUsd: 0, todayTradesCount: 0 }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle User Volume & Percentile
 */
async function handleUserVolume(request, env, url) {
  const address = (url.searchParams.get('address') || '').toLowerCase();
  const todayDate = new Date().toISOString().split('T')[0];

  if (!env?.APPOINTMENTS_DB || !address) {
    return new Response(
      JSON.stringify({ todayVolumeUsd: 0, tradeCount: 0, percentile: 0, isEligibleTopTier: false }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const userVol = await env.APPOINTMENTS_DB.prepare(
      'SELECT volume_usd, trade_count FROM daily_active_volume WHERE user_address = ? AND epoch_date = ?'
    ).bind(address, todayDate).first();

    const todayVolume = Number(userVol?.volume_usd || 0);

    const countAll = await env.APPOINTMENTS_DB.prepare(
      'SELECT COUNT(*) as count FROM daily_active_volume WHERE epoch_date = ?'
    ).bind(todayDate).first();

    const countLower = await env.APPOINTMENTS_DB.prepare(
      'SELECT COUNT(*) as count FROM daily_active_volume WHERE epoch_date = ? AND volume_usd < ?'
    ).bind(todayDate, todayVolume).first();

    const totalTraders = countAll?.count || 1;
    let percentile = 0;
    if (todayVolume > 0) {
      percentile = Math.min(100, Math.round(((countLower?.count || 0) / totalTraders) * 100));
    }

    return new Response(
      JSON.stringify({
        todayVolumeUsd: todayVolume,
        tradeCount: userVol?.trade_count || 0,
        percentile,
        isEligibleTopTier: percentile >= 85,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ todayVolumeUsd: 0, tradeCount: 0, percentile: 0, isEligibleTopTier: false }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}

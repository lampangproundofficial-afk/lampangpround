interface BridgeEnv {
  bridgeMode: string;
  targetOrigin: string;
}

function unavailable(request: Request): Response {
  const headers = {
    'cache-control': 'no-store',
    'retry-after': '120',
  };
  if (new URL(request.url).pathname.startsWith('/api/')) {
    return new Response(
      JSON.stringify({ success: false, message: 'ระบบกำลังย้ายข้อมูล กรุณาลองใหม่ภายหลัง' }),
      { status: 503, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } }
    );
  }
  return new Response(
    '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>กำลังปรับปรุงระบบ</title><main style="max-width:36rem;margin:15vh auto;padding:1.5rem;font:1rem/1.6 sans-serif"><h1>ระบบกำลังย้ายข้อมูล</h1><p>กรุณาลองใหม่อีกครั้งในภายหลัง</p></main></html>',
    { status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } }
  );
}

function targetUrl(requestUrl: URL, targetOrigin: string): URL | null {
  try {
    const target = new URL(targetOrigin);
    if (target.protocol !== 'https:' || target.origin !== targetOrigin || target.origin === requestUrl.origin) {
      return null;
    }
    target.pathname = requestUrl.pathname;
    target.search = requestUrl.search;
    return target;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: BridgeEnv): Promise<Response> {
    if (env.bridgeMode !== 'redirect') return unavailable(request);

    const url = new URL(request.url);
    const target = targetUrl(url, env.targetOrigin);
    if (!target) return unavailable(request);

    const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/images/');
    const isNavigation = request.headers.get('sec-fetch-mode') === 'navigate' ||
      request.headers.get('accept')?.includes('text/html') === true;
    if ((request.method === 'GET' || request.method === 'HEAD') && !isApi && isNavigation) {
      return new Response(null, {
        status: 302,
        headers: { location: target.href, 'cache-control': 'no-store' },
      });
    }

    try {
      const forwarded = new Request(target, request);
      forwarded.headers.delete('origin');
      forwarded.headers.delete('host');
      return await fetch(forwarded);
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: 'บริการปลายทางไม่ตอบสนอง กรุณาตรวจสอบผลคำขอก่อนลองอีกครั้ง' }),
        { status: 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }
      );
    }
  },
};

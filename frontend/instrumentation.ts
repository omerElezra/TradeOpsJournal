export async function register() {
  // This hook also runs in the Edge runtime (middleware), where native modules
  // like undici are unavailable. Only set up the proxy in the Node.js runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!proxy) return;

  // Node 18+ bundles undici as the fetch backend. It does not read http_proxy
  // env vars automatically, so we wire up a ProxyAgent here.
  const { ProxyAgent, setGlobalDispatcher } = await import("undici");
  setGlobalDispatcher(new ProxyAgent(proxy));
}

export function resolveLiveConfig({ known, liveConfig = {}, env = process.env }) {
  let url = known.url ?? env.npm_config_url ?? null;
  let instance = known.instance ?? env.npm_config_instance ?? null;

  if (known.live && !url && !instance) {
    if (liveConfig.url) {
      url = liveConfig.url;
    } else {
      instance = liveConfig.instance ?? null;
    }
  }

  return {
    url,
    instance,
    clientIdArg: known.clientId ?? env.npm_config_client_id ?? env.ZEYOS_CLIENT_ID ?? liveConfig.clientId ?? null,
    clientSecretArg: known.clientSecret ?? env.npm_config_client_secret ?? env.ZEYOS_CLIENT_SECRET ?? liveConfig.clientSecret ?? null,
    port: known.port ?? env.npm_config_port ?? ((url || instance) ? liveConfig.port ?? null : null)
  };
}

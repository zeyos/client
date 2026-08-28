/**
 * zeyos doctor agent
 *
 * Offline diagnostic for coding agents before they rely on the CLI.
 */

import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { loadConfigWithSource, localConfigPath, globalConfigPath, tokenStatus } from '../lib/config.mjs';
import { loadResourceConfig } from '../lib/resource-config.mjs';
import { listResources, resolveResource } from '../lib/resources.mjs';
import { colors as c, error, outputMode, printJson, printYaml } from '../lib/output.mjs';
import { EXIT } from '../lib/exit.mjs';

const require = createRequire(import.meta.url);
const VERSION = require('../package.json').version;

const ENV_KEYS = {
  ZEYOS_BASE_URL:      'baseUrl',
  ZEYOS_INSTANCE:      'instance',
  ZEYOS_CLIENT_ID:     'clientId',
  ZEYOS_CLIENT_SECRET: 'clientSecret',
  ZEYOS_TOKEN:         'accessToken',
  ZEYOS_REFRESH_TOKEN: 'refreshToken',
  ZEYOS_NO_REFRESH:    'tokenOnly',
  ZEYOS_CREDENTIALS_READONLY: 'credentialsReadonly',
};

export const USAGE = `\
Usage: zeyos doctor agent [options]

Check local CLI readiness for coding agents. Runs offline and never prints
tokens or client secrets.

Options:
  --json              Output as JSON
  --yaml              Output as YAML
  -h, --help          Show this help

Examples:
  zeyos doctor agent
  zeyos doctor agent --json
`;

export function run(values, positional = []) {
  const subject = positional[0];
  if (subject !== 'agent') {
    error('Unknown doctor target. Usage: zeyos doctor agent');
    process.exit(EXIT.USAGE);
  }

  const report = buildAgentReport(values);
  const mode = outputMode(values);

  if (mode === 'json') {
    printJson(report);
  } else if (mode === 'yaml') {
    printYaml(report);
  } else {
    printAgentReport(report);
  }

  // Exit non-zero when the environment isn't ready, so `zeyos doctor agent` can
  // be used as a CI health check rather than only read by a human.
  if (!report.ok) process.exitCode = EXIT.AUTH;
}

function buildAgentReport(values = {}) {
  const localPath = localConfigPath();
  const globalPath = globalConfigPath();
  const envVariables = Object.keys(ENV_KEYS).filter((key) => process.env[key]);
  let loaded = { config: {}, source: null };
  let configError = null;

  try {
    // Honour --profile: diagnosing the default credentials while the caller
    // asked about a specific profile is worse than not answering at all.
    loaded = loadConfigWithSource({ profile: values.profile });
  } catch (err) {
    configError = err.message || String(err);
  }
  if (loaded.profile?.missing) {
    configError = `Profile "${loaded.profile.name}" (selected via ${loaded.profile.origin}) does not exist.`;
  }

  const config = loaded.config;
  const effective = {
    baseUrl:      Boolean(config.baseUrl),
    instance:     Boolean(config.instance),
    clientId:     Boolean(config.clientId),
    clientSecret: Boolean(config.clientSecret),
    accessToken:  Boolean(config.accessToken),
    refreshToken: Boolean(config.refreshToken),
    tokenOnly:    Boolean(process.env.ZEYOS_TOKEN) || isTruthyEnv(process.env.ZEYOS_NO_REFRESH),
  };
  // Presence is not readiness: an expired access token with no refresh token
  // cannot authenticate, and reporting it as ready defeats the point of a
  // health check.
  const token = tokenStatus(config);
  const tokenUsable = token === 'ok' || token === 'present' ||
    (token === 'expired' && Boolean(config.refreshToken));
  const ready = Boolean(
    effective.baseUrl && effective.accessToken && tokenUsable &&
    (effective.tokenOnly || (effective.clientId && effective.clientSecret))
  );
  const resources = inspectResources();

  const nextSteps = [];
  if (configError) nextSteps.push(configError);
  if (!effective.baseUrl) nextSteps.push('Set ZEYOS_BASE_URL or run: zeyos login --base-url <url>');
  if (!effective.accessToken) nextSteps.push('Run: zeyos login');
  else if (!tokenUsable) nextSteps.push('Access token is expired and no refresh token is stored. Run: zeyos login --force');
  if (!effective.tokenOnly && effective.accessToken && !(effective.clientId && effective.clientSecret)) {
    nextSteps.push('Client credentials are missing; token refresh will fail. Run: zeyos login --force');
  }

  return {
    ok: ready && !configError && resources.ok,
    nextSteps,
    cli: {
      version: VERSION,
    },
    connection: {
      baseUrl: config.baseUrl ?? null,
      instance: config.instance ?? null,
    },
    auth: {
      ready,
      source: envVariables.length > 0 ? 'env' : loaded.source,
      env: {
        present: envVariables.length > 0,
        variables: envVariables,
      },
      local: {
        present: Boolean(localPath),
        path: localPath,
      },
      global: {
        present: existsSync(globalPath),
        path: globalPath,
      },
      effective,
      error: configError,
    },
    resources,
  };
}

function isTruthyEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function inspectResources() {
  const names = listResources();
  const missing = [];
  const configErrors = [];

  for (const name of names) {
    if (!resolveResource(name)) {
      missing.push(name);
      continue;
    }

    try {
      loadResourceConfig(name);
    } catch (err) {
      configErrors.push(err.message || String(err));
    }
  }

  return {
    ok: names.length > 0 && missing.length === 0 && configErrors.length === 0,
    count: names.length,
    shippedConfigCount: countShippedResourceConfigs(),
    missing,
    configErrors,
  };
}

function countShippedResourceConfigs() {
  try {
    return readdirSync(new URL('../config/', import.meta.url))
      .filter((name) => name.endsWith('.json'))
      .length;
  } catch {
    return 0;
  }
}

function printAgentReport(report) {
  process.stdout.write('\n');
  process.stdout.write(`  ${c.bold('ZeyOS CLI doctor: agent')}\n\n`);
  process.stdout.write(`  CLI version        ${report.cli.version}\n`);
  process.stdout.write(`  Base URL           ${report.connection.baseUrl ?? '(not set)'}\n`);
  process.stdout.write(`  Instance           ${report.connection.instance ?? '(not set)'}\n`);
  process.stdout.write(`  Auth ready         ${yesNo(report.auth.ready)}\n`);
  process.stdout.write(`  Auth source        ${report.auth.source ?? '(none)'}\n`);
  process.stdout.write(`  Env config         ${report.auth.env.present ? report.auth.env.variables.join(', ') : '(none)'}\n`);
  process.stdout.write(`  Local config       ${report.auth.local.present ? report.auth.local.path : '(none)'}\n`);
  process.stdout.write(`  Global config      ${report.auth.global.present ? report.auth.global.path : '(none)'}\n`);
  process.stdout.write(`  Resource registry  ${report.resources.ok ? 'ok' : 'problem'} (${report.resources.count} resources, ${report.resources.shippedConfigCount} shipped configs)\n`);

  if (report.auth.error) {
    process.stdout.write(`\n  ${c.bold('Auth config error')}\n`);
    process.stdout.write(`  ${report.auth.error}\n`);
  }
  if (report.resources.configErrors.length > 0) {
    process.stdout.write(`\n  ${c.bold('Resource config errors')}\n`);
    for (const message of report.resources.configErrors) {
      process.stdout.write(`  ${message}\n`);
    }
  }
  if (report.nextSteps.length > 0) {
    process.stdout.write(`\n  ${c.bold('Next steps')}\n`);
    for (const step of report.nextSteps) {
      process.stdout.write(`  · ${step}\n`);
    }
  }

  process.stdout.write('\n');
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

#!/usr/bin/env tsx
/**
 * Imports the unified provider catalog from cc-switch by walking all five
 * preset sources and merging by preset name.
 *
 * Run from the cdesktop/ directory:
 *   node_modules/.pnpm/node_modules/.bin/tsx scripts/import-provider-catalog.ts
 *
 * Output: crates/db/src/provider_catalog.json
 *
 * Sources walked:
 *   - related/cc-switch/src/config/claudeProviderPresets.ts
 *   - related/cc-switch/src/config/codexProviderPresets.ts
 *   - related/cc-switch/src/config/opencodeProviderPresets.ts
 *   - related/cc-switch/src/config/hermesProviderPresets.ts
 *
 * For each preset name in WANTED, we look it up in each of the four sources
 * and emit a unified record with per-agent payloads. agents[] = sources where
 * the preset is found AND passes eligibility filters:
 *   - CODEX:  config TOML must contain `wire_api = "responses"`.
 *   - GEMINI: never sourced from cc-switch — the only Western-official entry
 *             ("Google Official") overlaps the Default provider's ambient
 *             gemini-cli auth, and remaining cc-switch gemini presets have
 *             known upstream issues. All catalog presets emit an empty
 *             gemini slot; users wanting Gemini routing create a Custom record.
 *   - DEEPSEEK_TUI: not in cc-switch; skipped this phase, surfaced in Phase E.
 *
 * Normalization applied at instantiation time (not here):
 *   - ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL
 *     stripped from claude.env, surfaced under "Advanced env"
 *   - ANTHROPIC_DEFAULT_HAIKU_MODEL migrated to claude.haikuModel field
 */

import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CC_SWITCH_DIR = resolve(__dirname, "../../related/cc-switch");
const OUT_PATH = resolve(__dirname, "../crates/db/src/provider_catalog.json");

// Preset IDs we want, in display order. Key = our slug; value = cc-switch name
// (must match exactly across all five sources where the preset appears).
const WANTED: Record<string, string> = {
  "openrouter": "OpenRouter",
  "novita-ai": "Novita AI",
  "nvidia": "Nvidia",
  "bailian": "Bailian",
  "bailian-for-coding": "Bailian For Coding",
  "kimi": "Kimi",
  "kimi-for-coding": "Kimi For Coding",
  "stepfun": "StepFun",
  "stepfun-en": "StepFun en",
  "kat-coder": "KAT-Coder",
  "longcat": "Longcat",
  "minimax": "MiniMax",
  "minimax-en": "MiniMax en",
  "doubao-seed": "DouBaoSeed",
  "bailing": "BaiLing",
  "xiaomi-mimo": "Xiaomi MiMo",
  "aws-bedrock-api-key": "AWS Bedrock (API Key)",
  "modelscope": "ModelScope",
  "deepseek": "DeepSeek",
  "zhipu-glm": "Zhipu GLM",
  "zhipu-glm-en": "Zhipu GLM en",
  "baidu-qianfan": "Baidu Qianfan Coding Plan",
};

// Extractor script: dumps every preset array to JSON on stdout.
const EXTRACTOR_PATH = resolve(CC_SWITCH_DIR, "_cdesktop_extractor.ts");
const extractorSrc = `
import { providerPresets } from "./src/config/claudeProviderPresets.ts";
import { codexProviderPresets } from "./src/config/codexProviderPresets.ts";
import { opencodeProviderPresets } from "./src/config/opencodeProviderPresets.ts";
import { hermesProviderPresets } from "./src/config/hermesProviderPresets.ts";
process.stdout.write(JSON.stringify({
  claude: providerPresets,
  codex: codexProviderPresets,
  opencode: opencodeProviderPresets,
  hermes: hermesProviderPresets,
}));
`;

writeFileSync(EXTRACTOR_PATH, extractorSrc);

interface ExtractedSources {
  claude: ClaudeRaw[];
  codex: CodexRaw[];
  opencode: OpencodeRaw[];
  hermes: HermesRaw[];
}

interface ClaudeRaw {
  name: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  apiKeyField?: string;
  settingsConfig?: { env?: Record<string, string | number | boolean> };
  category?: string;
}

interface CodexRaw {
  name: string;
  config: string; // TOML string
}

interface OpencodeRaw {
  name: string;
  settingsConfig: {
    npm?: string;
    name?: string;
    options?: Record<string, unknown>;
    models?: Record<string, unknown>;
  };
}

interface HermesRaw {
  name: string;
  settingsConfig: {
    name: string;
    base_url?: string;
    api_key?: string;
    api_mode?: string;
    models?: Array<{ id: string; name?: string }>;
  };
}

let sources: ExtractedSources;
try {
  const tsx = resolve(
    CC_SWITCH_DIR,
    "../../cdesktop/node_modules/.pnpm/node_modules/.bin/tsx"
  );
  const result = spawnSync(tsx, [EXTRACTOR_PATH], {
    cwd: CC_SWITCH_DIR,
    encoding: "utf-8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`extractor failed:\n${result.stderr}`);
  }
  sources = JSON.parse(result.stdout);
} finally {
  if (existsSync(EXTRACTOR_PATH)) unlinkSync(EXTRACTOR_PATH);
}

function indexByName<T extends { name: string }>(arr: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of arr) m.set(item.name, item);
  return m;
}

const claudeByName = indexByName(sources.claude);
const codexByName = indexByName(sources.codex);
const opencodeByName = indexByName(sources.opencode);
const hermesByName = indexByName(sources.hermes);

// --- Per-agent payload extractors ---

interface ClaudePayload {
  apiKeyField: string | null;
  baseUrl: string | null;
  haikuModel: string | null;
  env: Record<string, string>;
}

function extractClaude(raw: ClaudeRaw | undefined): ClaudePayload | null {
  if (!raw) return null;
  const rawEnv = raw.settingsConfig?.env ?? {};
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawEnv)) env[k] = String(v);

  const baseUrl = env.ANTHROPIC_BASE_URL ?? null;
  delete env.ANTHROPIC_BASE_URL;

  const haikuModel = env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? null;
  delete env.ANTHROPIC_DEFAULT_HAIKU_MODEL;

  // Strip per-message-conflicting keys (§6.1)
  delete env.ANTHROPIC_MODEL;
  delete env.ANTHROPIC_DEFAULT_SONNET_MODEL;
  delete env.ANTHROPIC_DEFAULT_OPUS_MODEL;

  let apiKeyField = raw.apiKeyField ?? null;
  if (!apiKeyField) {
    if ("ANTHROPIC_AUTH_TOKEN" in env) apiKeyField = "ANTHROPIC_AUTH_TOKEN";
    else if ("ANTHROPIC_API_KEY" in env) apiKeyField = "ANTHROPIC_API_KEY";
    else apiKeyField = "ANTHROPIC_AUTH_TOKEN";
  }
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_API_KEY;

  return { apiKeyField, baseUrl, haikuModel, env };
}

interface CodexPayload {
  baseUrl: string | null;
  env: Record<string, string>;
  wireApi: string | null; // captured for eligibility check; not emitted
}

function extractCodex(raw: CodexRaw | undefined): CodexPayload | null {
  if (!raw) return null;
  const toml = raw.config;
  if (!toml) return null;

  const baseUrlMatch = toml.match(/\bbase_url\s*=\s*"([^"]+)"/);
  const wireApiMatch = toml.match(/\bwire_api\s*=\s*"([^"]+)"/);
  return {
    baseUrl: baseUrlMatch?.[1] ?? null,
    env: {},
    wireApi: wireApiMatch?.[1] ?? null,
  };
}

interface OpencodePayload {
  npm: string | null;
  baseUrl: string | null;
  options: Record<string, unknown>;
  env: Record<string, string>;
}

function extractOpencode(raw: OpencodeRaw | undefined): OpencodePayload | null {
  if (!raw) return null;
  const sc = raw.settingsConfig ?? {};
  const opts = { ...(sc.options ?? {}) } as Record<string, unknown>;
  const baseUrl =
    typeof opts.baseURL === "string" ? (opts.baseURL as string) : null;
  // baseURL hoisted to top-level baseUrl; apiKey is synthesized at spawn.
  delete opts.baseURL;
  delete opts.apiKey;
  return {
    npm: sc.npm ?? null,
    baseUrl,
    options: opts,
    env: {},
  };
}

interface HermesPayload {
  baseUrl: string | null;
  apiMode: string | null;
  env: Record<string, string>;
}

function extractHermes(raw: HermesRaw | undefined): HermesPayload | null {
  if (!raw) return null;
  const sc = raw.settingsConfig;
  return {
    baseUrl: sc.base_url ?? null,
    apiMode: sc.api_mode ?? null,
    env: {},
  };
}

function extractEnabledModels(
  opencode: OpencodeRaw | undefined,
  hermes: HermesRaw | undefined
): string[] {
  // Preference: OpenCode (richer model lists) → Hermes → empty.
  // Caller layers in any other source they find useful.
  const fromOpencode = opencode?.settingsConfig?.models
    ? Object.keys(opencode.settingsConfig.models)
    : [];
  if (fromOpencode.length > 0) return fromOpencode;
  const fromHermes = hermes?.settingsConfig?.models?.map((m) => m.id) ?? [];
  return fromHermes;
}

// --- Build the catalog ---

interface CatalogPreset {
  id: string;
  name: string;
  agents: string[];
  claude: {
    apiKeyField: string | null;
    baseUrl: string | null;
    haikuModel: string | null;
    env: Record<string, string>;
  };
  codex: { baseUrl: string | null; env: Record<string, string> };
  opencode: {
    npm: string | null;
    baseUrl: string | null;
    options: Record<string, unknown>;
    env: Record<string, string>;
  };
  deepseekTui: { baseUrl: string | null; env: Record<string, string> };
  gemini: { baseUrl: string | null; env: Record<string, string> };
  hermes: {
    baseUrl: string | null;
    apiMode: string | null;
    env: Record<string, string>;
  };
  enabledModels: string[];
}

const sha = execSync("git rev-parse HEAD", { cwd: CC_SWITCH_DIR })
  .toString()
  .trim();

const presets: CatalogPreset[] = [];
const warnings: string[] = [];

for (const [id, ccName] of Object.entries(WANTED)) {
  const claudeRaw = claudeByName.get(ccName);
  const codexRaw = codexByName.get(ccName);
  const opencodeRaw = opencodeByName.get(ccName);
  const hermesRaw = hermesByName.get(ccName);

  if (!claudeRaw && !codexRaw && !opencodeRaw && !hermesRaw) {
    warnings.push(`preset "${ccName}" not found in any cc-switch source`);
    continue;
  }

  const claudeExtracted = extractClaude(claudeRaw);
  const codexExtracted = extractCodex(codexRaw);
  const opencodeExtracted = extractOpencode(opencodeRaw);
  const hermesExtracted = extractHermes(hermesRaw);

  // Eligibility filters → recommended agents[] for this preset.
  // Per plan §3.2: when an agent is INELIGIBLE for a preset, its payload slot
  // must be empty (null baseUrl + empty env), not populated with cc-switch's
  // raw data. Otherwise a user toggling perAgentEnabled[X]=true on an
  // ineligible agent would inherit a misleading non-null baseUrl and the
  // spawn applier would 404 silently.
  const agents: string[] = [];

  const claudeEligible = !!(claudeExtracted && claudeExtracted.baseUrl);
  if (claudeEligible) agents.push("CLAUDE_CODE");

  // Codex: must speak Responses API.
  const codexEligible = !!(
    codexExtracted &&
    codexExtracted.baseUrl &&
    codexExtracted.wireApi === "responses"
  );
  if (codexEligible) agents.push("CODEX");

  const opencodeEligible = !!(opencodeExtracted && opencodeExtracted.baseUrl);
  if (opencodeEligible) agents.push("OPENCODE");

  // GEMINI: never sourced from cc-switch (see header comment). Slot stays empty.

  const hermesEligible = !!(hermesExtracted && hermesExtracted.baseUrl);
  if (hermesEligible) agents.push("HERMES");
  // DEEPSEEK_TUI: not in cc-switch — added in Phase E.

  presets.push({
    id,
    name: claudeRaw?.name ?? ccName,
    agents,
    claude: claudeEligible
      ? claudeExtracted!
      : { apiKeyField: null, baseUrl: null, haikuModel: null, env: {} },
    codex: codexEligible
      ? { baseUrl: codexExtracted!.baseUrl, env: codexExtracted!.env }
      : { baseUrl: null, env: {} },
    opencode: opencodeEligible
      ? opencodeExtracted!
      : { npm: null, baseUrl: null, options: {}, env: {} },
    deepseekTui: { baseUrl: null, env: {} },
    gemini: { baseUrl: null, env: {} },
    hermes: hermesEligible
      ? hermesExtracted!
      : { baseUrl: null, apiMode: null, env: {} },
    enabledModels: extractEnabledModels(opencodeRaw, hermesRaw),
  });
}

const catalog = {
  schema_version: 2,
  cc_switch_source_sha: sha,
  note:
    "Per-agent payloads derived programmatically from cc-switch's claude/codex/opencode/hermes preset sources. " +
    "agents[] = recommended set, computed from per-agent payload availability + eligibility filters " +
    "(CODEX requires wire_api='responses'; GEMINI is never sourced from cc-switch — Default's ambient " +
    "auth covers official Google routing and remaining cc-switch gemini presets have known upstream issues; " +
    "DEEPSEEK_TUI is added in Phase E once the executor lands).",
  presets,
};

writeFileSync(OUT_PATH, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Wrote ${presets.length} presets to ${OUT_PATH}`);
console.log(`Pinned to cc-switch SHA: ${sha}`);
if (warnings.length > 0) {
  console.log(`\nWarnings:`);
  for (const w of warnings) console.log(`  - ${w}`);
}

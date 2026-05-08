#!/usr/bin/env tsx
/**
 * Imports the provider catalog from cc-switch's claudeProviderPresets.ts.
 * Run from the cdesktop/ directory:
 *   node_modules/.pnpm/node_modules/.bin/tsx scripts/import-provider-catalog.ts
 *
 * Output: crates/db/src/provider_catalog.json
 *
 * Normalization applied at instantiation time (not here):
 *   - ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL
 *     stripped from env, surfaced under "Advanced env"
 *   - ANTHROPIC_DEFAULT_HAIKU_MODEL migrated to haiku_model field
 */

import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CC_SWITCH_DIR = resolve(__dirname, "../../related/cc-switch");
const OUT_PATH = resolve(__dirname, "../crates/db/src/provider_catalog.json");

// The preset IDs we want, in display order. Key = our slug, value = cc-switch name.
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

// Write a temporary extractor script into cc-switch's own directory so tsx
// can resolve its imports (ProviderCategory etc.) correctly.
const EXTRACTOR_PATH = resolve(CC_SWITCH_DIR, "_cdesktop_extractor.ts");
const extractorSrc = `
import { providerPresets } from "./src/config/claudeProviderPresets.ts";
process.stdout.write(JSON.stringify(providerPresets));
`;

writeFileSync(EXTRACTOR_PATH, extractorSrc);

let allPresets: unknown[] = [];
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
  allPresets = JSON.parse(result.stdout);
} finally {
  if (existsSync(EXTRACTOR_PATH)) unlinkSync(EXTRACTOR_PATH);
}

interface RawEnv {
  [key: string]: string | number | boolean;
}

interface RawPreset {
  name: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  apiKeyField?: string;
  settingsConfig?: { env?: RawEnv };
  category?: string;
  icon?: string;
  iconColor?: string;
  modelsUrl?: string;
  endpointCandidates?: string[];
}

interface CatalogPreset {
  id: string;
  name: string;
  category: string | null;
  website_url: string;
  api_key_url: string | null;
  api_key_field: string;
  icon: string | null;
  icon_color: string | null;
  env: Record<string, string>;
  models_url: string | null;
  endpoint_candidates: string[] | null;
}

const nameToPreset = new Map(
  (allPresets as RawPreset[]).map((p) => [p.name, p])
);

const sha = execSync("git rev-parse HEAD", { cwd: CC_SWITCH_DIR })
  .toString()
  .trim();

const presets: CatalogPreset[] = [];

for (const [id, ccName] of Object.entries(WANTED)) {
  const raw = nameToPreset.get(ccName);
  if (!raw) {
    console.error(`WARNING: preset "${ccName}" not found in cc-switch`);
    continue;
  }

  const rawEnv = raw.settingsConfig?.env ?? {};
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawEnv)) {
    env[k] = String(v);
  }

  let apiKeyField = raw.apiKeyField ?? "ANTHROPIC_AUTH_TOKEN";
  if (!raw.apiKeyField) {
    if ("ANTHROPIC_AUTH_TOKEN" in env) apiKeyField = "ANTHROPIC_AUTH_TOKEN";
    else if ("ANTHROPIC_API_KEY" in env) apiKeyField = "ANTHROPIC_API_KEY";
  }

  presets.push({
    id,
    name: raw.name,
    category: raw.category ?? null,
    website_url: raw.websiteUrl,
    api_key_url: raw.apiKeyUrl ?? null,
    api_key_field: apiKeyField,
    icon: raw.icon ?? null,
    icon_color: raw.iconColor ?? null,
    env,
    models_url: raw.modelsUrl ?? null,
    endpoint_candidates: raw.endpointCandidates ?? null,
  });
}

const catalog = {
  schema_version: 1,
  cc_switch_source_sha: sha,
  note: "env values preserved verbatim. At preset instantiation: ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL stripped from env; ANTHROPIC_DEFAULT_HAIKU_MODEL migrated to haiku_model field.",
  presets,
};

writeFileSync(OUT_PATH, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Wrote ${presets.length} presets to ${OUT_PATH}`);
console.log(`Pinned to cc-switch SHA: ${sha}`);

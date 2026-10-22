'use strict';

const { resolve, relative, isAbsolute } = require('node:path');
const LOCAL_FAMILIES = /^(?:task_|swarm_|claims_|guidance_|memory_|session_|config_|coordination_|daa_|neural_|aidefence_|progress_(?:check|summary)|agentdb_|ruvllm_)/;
const LOCAL_AGENTS = new Set(['agent_spawn','agent_terminate','agent_status','agent_list','agent_health','agent_update','agent_logs']);
const LOCAL_HOOKS = new Set(['hooks_pre-command','hooks_post-command','hooks_route','hooks_metrics','hooks_list','hooks_pre-task','hooks_post-task','hooks_explain','hooks_notify','hooks_model-route','hooks_model-outcome','hooks_model-stats','hooks_model-verify','hooks_coverage-route','hooks_coverage-suggest','hooks_coverage-gaps']);
const EXCLUDED = new Set(['memory_import_claude','memory_migrate','session_restore','session_import','config_import','config_set','config_reset']);
const PATH_KEY = /(?:path|directory|filename|file|memoryBase|cwd|projectRoot)$/i;

function canRunLocally(name) {
  return !EXCLUDED.has(name) && (LOCAL_FAMILIES.test(name) || LOCAL_AGENTS.has(name) || LOCAL_HOOKS.has(name) || ['mcp_status','system_status','system_metrics','system_health','system_info','policy_status','policy_evaluate'].includes(name));
}

function scopeArguments(value, projectDirectory, guard, depth = 0) {
  if (depth > 25) throw new Error('Parâmetros aninhados demais.');
  if (!value || typeof value !== 'object') return value;
  const result = Array.isArray(value) ? [] : {};
  for (const [name, child] of Object.entries(value)) {
    if (['__proto__','constructor','prototype'].includes(name)) throw new Error('Chave de protótipo não permitida.');
    if (['value','result','metadata','context'].includes(name)) result[name]=child;
    else if (PATH_KEY.test(name) && typeof child === 'string') {
      if (/^[a-z]:[^\\/]|^\\\\|:(?![\\/])/i.test(child) || child.includes('\0')) throw new Error('Formato de caminho não permitido.');
      const destination = resolve(projectDirectory, child);
      const inside = relative(projectDirectory, destination);
      if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('O caminho deve ficar no projeto privado do SanduBAH.');
      guard(destination);
      result[name] = destination;
    } else result[name] = scopeArguments(child, projectDirectory, guard, depth + 1);
  }
  return result;
}

function resultFailed(result) {
  if (result?.isError || result?.success === false || result?.status === 'error' || result?.error) return true;
  return (result?.content || []).some(block => {
    if (block.type !== 'text') return false;
    try { const parsed = JSON.parse(block.text); return parsed?.success === false || parsed?.status === 'error' || Boolean(parsed?.error); } catch { return false; }
  });
}

module.exports = { canRunLocally, scopeArguments, resultFailed };

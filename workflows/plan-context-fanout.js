export const meta = {
  name: 'plan-context-fanout',
  description: 'Gather planning context for a Linear issue in parallel: repo, ADRs, prior plans, related issues, nerdbrain vault',
  whenToUse: 'Planning phase of linear-issue-workflow, before drafting the implementation plan',
  phases: [
    { title: 'Gather', detail: '4 repo gatherers + 1 vault gatherer, all concurrent' },
  ],
}

// One script, two contract nodes (ADR-0003: one island runs both): `plan-context-fanout`
// produces PlanContext from the repo, `wiki-recall` produces ProjectContext from the vault.
// Input arrives as args: { issueId: "TEAM-123", spec: <IssueSpec> } — the IssueSpec edge
// payload plus the issue id the Linear gatherer queries by.

// Verbatim copies of the registry bodies in workflow-graph.json — the script cannot read
// the contract at runtime (no fs, no import()), so the drift check (validator rules 17-18)
// holds these literals deep-equal to the registry.
const SCHEMA_PlanContext = {
  "type": "object",
  "title": "Plan context",
  "properties": {
    "repoLayout": {
      "type": "string",
      "title": "Repo layout",
      "description": "The directories and files the change will touch."
    },
    "conventions": {
      "type": "array",
      "title": "Conventions",
      "description": "In-repo rules the plan must follow: CONTEXT.md terms, ADRs, commit style.",
      "items": { "type": "string" }
    },
    "priorArt": {
      "type": "array",
      "title": "Prior art",
      "description": "Earlier plans, related issues and merged PRs worth reading before drafting.",
      "items": { "type": "string" }
    },
    "commands": {
      "type": "array",
      "title": "Commands",
      "description": "Test, build and validator commands the plan will cite.",
      "items": { "type": "string" }
    },
    "stats": {
      "type": "object",
      "title": "Fan-out stats",
      "description": "Passive observability of the fan-out, counted by the reducer from what the run already produced. Optional: absent whenever the context was gathered sequentially instead of as an island.",
      "properties": {
        "gatherers": {
          "type": "array",
          "title": "Per gatherer",
          "description": "One row per gatherer the island spawns, in its fixed spawn order — a failed gatherer stays in the list with zeros rather than vanishing.",
          "items": {
            "type": "object",
            "title": "Gatherer stats",
            "description": "What one gatherer contributed to the reduced context.",
            "properties": {
              "source": {
                "type": "string",
                "title": "Source",
                "description": "The gatherer this row counts, e.g. `conventions`."
              },
              "returned": {
                "type": "integer",
                "title": "Returned",
                "description": "Non-empty list items the gatherer returned, before reduction."
              },
              "unique": {
                "type": "integer",
                "title": "Unique",
                "description": "Items it was the first to contribute that survived into the reduced context. A gatherer at zero across successive runs is a removal candidate."
              }
            },
            "required": ["source", "returned", "unique"]
          }
        },
        "duplicatesDropped": {
          "type": "integer",
          "title": "Duplicates dropped",
          "description": "Returned items the reducer discarded as duplicates or past a recall limit — the fan-out's redundancy."
        },
        "gapsCount": {
          "type": "integer",
          "title": "Gaps",
          "description": "Gaps the run reported: the node-failure count for this island."
        }
      },
      "required": ["gatherers", "duplicatesDropped", "gapsCount"]
    }
  },
  "required": ["repoLayout", "conventions"]
}

const SCHEMA_ProjectContext = {
  "type": "object",
  "title": "Project context",
  "properties": {
    "slug": {
      "type": "string",
      "title": "Slug",
      "description": "Slug of the entity page the SessionStart hook injected."
    },
    "decisions": {
      "type": "array",
      "title": "Decisions",
      "description": "Recorded project decisions the plan must not contradict without flagging it.",
      "items": { "type": "string" }
    },
    "activeContext": {
      "type": "string",
      "title": "Active context",
      "description": "What the entity page says is currently in flight."
    },
    "relatedPages": {
      "type": "array",
      "title": "Related pages",
      "description": "One hop out: pages linked from the entity page or linking back to it.",
      "items": { "type": "string" }
    }
  },
  "required": ["slug", "decisions"]
}

// Width: 4 repo gatherers + 1 vault gatherer = 5, within the contract budgets
// (plan-context-fanout.budget.maxWidth = 6, wiki-recall.budget.maxWidth = 1).
// The script cannot read the contract, so the number lives here as a constant.
const GATHERERS = 5

// Reduction limits, from nerdbrain-wiki's graph-recall contract.
const MAX_RELATED_PAGES = 3
const MAX_SEARCH_RESULTS = 5

const issueId = args && args.issueId ? String(args.issueId) : ''
const spec = args && args.spec ? JSON.stringify(args.spec) : '(no IssueSpec provided — gather generically)'

// Intermediate gatherer shapes — deliberately NOT named SCHEMA_<Name>: they are not
// contract edges, so they must stay invisible to the drift check.
const repoFactsShape = {
  type: 'object',
  properties: {
    repoLayout: { type: 'string', description: 'Directories and files the change will touch, one compact paragraph' },
    commands: { type: 'array', items: { type: 'string' }, description: 'Test, build and validator commands, verbatim' },
  },
  required: ['repoLayout', 'commands'],
}

const stringListShape = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'string' } },
  },
  required: ['items'],
}

phase('Gather')
log(`Fanning out ${GATHERERS} context gatherers for ${issueId || 'the issue'}`)

const issueHeader = `Issue being planned: ${issueId}\nIssueSpec: ${spec}\n\n`

const [repoFacts, conventions, priorPlans, linearRelations, vault] = await parallel([
  () =>
    agent(
      issueHeader +
        'Map the repository for a planning agent. Read README.md and the top-level layout, find the directories and files this issue will likely touch, and collect the exact test/build/validator commands the repo documents (README, CLAUDE.md, scripts). Return repoLayout as one compact paragraph and commands as verbatim shell commands.',
      { label: 'gather:repo-layout', phase: 'Gather', schema: repoFactsShape },
    ),
  () =>
    agent(
      issueHeader +
        'Collect the in-repo rules a plan for this issue must follow. Read CONTEXT.md (glossary terms), every ADR under docs/adr/, and infer the commit-message style from `git log --oneline -15`. Return items: one string per rule or constraint, each prefixed with its source, e.g. "ADR-0003: ...", "CONTEXT.md: ...", "commits: ...".',
      { label: 'gather:conventions', phase: 'Gather', schema: stringListShape },
    ),
  () =>
    agent(
      issueHeader +
        'Collect prior art inside this repo: read every file under docs/superpowers/plans/ (if present) and the last few merged PRs (`gh pr list --state merged --limit 5`). Return items: one string per precedent — what it was and what a planner should copy from it.',
      { label: 'gather:prior-plans', phase: 'Gather', schema: stringListShape },
    ),
  () =>
    issueId === ''
      ? Promise.resolve({ items: [] })
      : agent(
          issueHeader +
            `Collect related Linear issues. Use the linearis CLI (read-only): \`linearis issues read ${issueId}\` returns JSON with parent, children and relations; fetch the parent and its sub-issues the same way. Return items: one string per related issue — "TEAM-123 (state): title — why it matters to this plan". If the CLI is unavailable, return an empty list.`,
          { label: 'gather:linear-relations', phase: 'Gather', schema: stringListShape },
        ),
  () =>
    agent(
      issueHeader +
        `Recall project context from the nerdbrain vault using the nerd4rent:nerdbrain-search skill recipes (filesystem + rg only, vault at ~/obsidian/nerdbrain/5-wiki/). Find the project entity page under entities/projects/, extract its slug, the "## Decisions" section (one string per decision) and "## Active context", then assemble the 1-hop graph (outgoing [[links]] + backlinks) for relatedPages. Keep at most ${MAX_SEARCH_RESULTS} search results per query and at most ${MAX_RELATED_PAGES} related pages. If the vault is unreachable, fail rather than invent content.`,
      { label: 'gather:vault', phase: 'Gather', schema: SCHEMA_ProjectContext },
    ),
])

// --- Deterministic reducer: plain code, no agents, no clock, no randomness. ---

// Fixed spawn order: a gatherer that failed keeps its row at zero instead of vanishing,
// which is what makes the node-failure half of the metric readable.
const SOURCES = ['repo-layout', 'conventions', 'prior-plans', 'linear-relations', 'vault']

const tally = new Map(SOURCES.map((source) => [source, { source, returned: 0, unique: 0 }]))

// Deduplicates a list assembled from one or more gatherers and attributes every surviving
// item to the first gatherer that contributed it, in the fixed order above.
function reduce(entries, limit) {
  const seen = new Set()
  const values = []
  const owners = []
  for (const entry of entries) {
    const row = tally.get(entry.source)
    for (const item of Array.isArray(entry.items) ? entry.items : []) {
      if (typeof item !== 'string') continue
      const trimmed = item.trim()
      if (trimmed.length === 0) continue
      row.returned++
      if (seen.has(trimmed)) continue
      seen.add(trimmed)
      values.push(trimmed)
      owners.push(row)
    }
  }
  const kept = limit === undefined ? values : values.slice(0, limit)
  for (const row of owners.slice(0, kept.length)) row.unique++
  return kept
}

// Missing required fields per the inlined out-schema — the island's own exit check.
function missingRequired(schema, value) {
  return schema.required.filter((field) => {
    const v = value === null ? undefined : value[field]
    if (v === undefined || v === null) return true
    if (typeof v === 'string') return v.trim().length === 0
    if (Array.isArray(v)) return v.length === 0
    return false
  })
}

const gaps = []
if (repoFacts === null) gaps.push('repo-layout gatherer failed: repoLayout and commands are missing')
if (conventions === null) gaps.push('conventions gatherer failed: CONTEXT.md/ADR constraints are missing')
if (priorPlans === null) gaps.push('prior-plans gatherer failed: docs/superpowers/plans precedents are missing')
if (linearRelations === null) gaps.push('linear-relations gatherer failed: related issues are missing')

const planContext = {
  repoLayout: repoFacts !== null && typeof repoFacts.repoLayout === 'string' ? repoFacts.repoLayout.trim() : '',
  conventions: reduce([{ source: 'conventions', items: conventions !== null ? conventions.items : [] }]),
  // Cap: two prior-art sources (plans + Linear), each held to the search-result limit.
  priorArt: reduce(
    [
      { source: 'prior-plans', items: priorPlans !== null ? priorPlans.items : [] },
      { source: 'linear-relations', items: linearRelations !== null ? linearRelations.items : [] },
    ],
    2 * MAX_SEARCH_RESULTS,
  ),
  commands: reduce([{ source: 'repo-layout', items: repoFacts !== null ? repoFacts.commands : [] }]),
}
for (const field of missingRequired(SCHEMA_PlanContext, planContext)) {
  gaps.push(`PlanContext.${field} is empty — degrade to the sequential context read for that part`)
}

// Vault failure never kills the run (wiki-recall failure policy): ProjectContext is
// simply absent and the gap is flagged for the planning agent.
let projectContext = null
if (vault === null) {
  gaps.push('vault gatherer failed (vault unreachable or no entity page): ProjectContext is absent')
} else {
  projectContext = {
    slug: typeof vault.slug === 'string' ? vault.slug.trim() : '',
    decisions: reduce([{ source: 'vault', items: vault.decisions }]),
    activeContext: typeof vault.activeContext === 'string' ? vault.activeContext.trim() : '',
    relatedPages: reduce([{ source: 'vault', items: vault.relatedPages }], MAX_RELATED_PAGES),
  }
  const missing = missingRequired(SCHEMA_ProjectContext, projectContext)
  if (missing.length > 0) {
    gaps.push(`ProjectContext incomplete (${missing.join(', ')} empty) — treat vault context as partial`)
    projectContext = null
  }
}

const gatherers = [...tally.values()]
planContext.stats = {
  gatherers,
  duplicatesDropped: gatherers.reduce((total, row) => total + row.returned - row.unique, 0),
  gapsCount: gaps.length,
}

log(`Reduced: ${planContext.conventions.length} conventions, ${planContext.priorArt.length} prior-art entries, vault ${projectContext !== null ? 'ok' : 'absent'}`)
log(`Fan-out: ${gatherers.map((row) => `${row.source} ${row.unique}/${row.returned}`).join(', ')}; ${planContext.stats.duplicatesDropped} dropped, ${gaps.length} gaps`)

return { planContext, projectContext, gaps }

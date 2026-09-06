import * as repo from './repo.js';
import { logToolCall } from './audit.js';

const WRITES_ENABLED = process.env.AGENT_WRITES_ENABLED === 'true';

/**
 * Every tool is scoped server-side to the
 * signed-in user (`ctx.user`) - the model can pass any filter values it
 * wants, but the underlying repo functions always AND those filters with
 * the caller's read/write scope. The model cannot widen its own access by
 * asking a different way.
 */
export const READ_TOOLS = [
  {
    name: 'list_opportunities',
    description:
      "List opportunities visible to the signed-in user, optionally filtered. Only returns rows the caller is allowed to read - never another team's data.",
    input_schema: {
      type: 'object',
      properties: {
        stage: { type: 'string', description: 'Exact stage: Discovery, Qualification, Proposal, Negotiation, Closed Won, Closed Lost' },
        open_only: { type: 'boolean', description: 'true = only open pipeline (excludes Closed Won/Lost)' },
        closed_only: { type: 'boolean', description: 'true = only Closed Won/Closed Lost' },
        min_amount: { type: 'number' },
        max_amount: { type: 'number' },
        account_name: { type: 'string', description: 'Partial, case-insensitive match on account name' },
        owner_name: { type: 'string', description: "Partial match on the owning rep's first or last name, e.g. 'Jordan' or 'Sam'" },
      },
    },
  },
  {
    name: 'get_opportunity',
    description: 'Get one opportunity by id, with its account and proposals, if the caller is allowed to read it.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: "Opportunity id, e.g. 'OPP-201'" } },
      required: ['id'],
    },
  },
  {
    name: 'list_accounts',
    description: 'List accounts visible to the signed-in user.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Partial, case-insensitive match on account name' } },
    },
  },
  {
    name: 'list_proposals',
    description: 'List proposals visible to the signed-in user, optionally filtered by status, opportunity, or account.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Draft, In review, Submitted, Accepted, or Declined' },
        opportunity_id: { type: 'string' },
        account_name: { type: 'string' },
      },
    },
  },
  {
    name: 'pipeline_summary',
    description: "Summarize the signed-in user's visible opportunities, grouped by stage or by owner, with counts and total dollar amount per group.",
    input_schema: {
      type: 'object',
      properties: { group_by: { type: 'string', enum: ['stage', 'owner'] } },
    },
  },
];

export const WRITE_TOOLS = [
  {
    name: 'create_opportunity',
    description: 'Create a new opportunity on an existing account. Fails if the caller cannot write for the target owner or cannot read that account.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        account_id: { type: 'string' },
        stage: { type: 'string' },
        amount: { type: 'number' },
        close_date: { type: 'string', description: 'YYYY-MM-DD' },
        owner_id: { type: 'string', description: 'Defaults to the signed-in user. Managers/admins may set another team member.' },
      },
      required: ['name', 'account_id'],
    },
  },
  {
    name: 'update_opportunity',
    description: "Update an opportunity's stage, amount, close date, or name. Fails if the caller cannot write that row.",
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        stage: { type: 'string' },
        amount: { type: 'number' },
        close_date: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_opportunity',
    description: 'Delete an opportunity (and its proposals). Fails if the caller cannot write that row.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'create_proposal',
    description: 'Create a new proposal on an existing opportunity.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        opportunity_id: { type: 'string' },
        status: { type: 'string' },
        amount: { type: 'number' },
        submitted_date: { type: 'string' },
        owner_id: { type: 'string' },
      },
      required: ['name', 'opportunity_id'],
    },
  },
  {
    name: 'update_proposal',
    description: "Update a proposal's status, amount, name, or submitted date.",
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string' },
        amount: { type: 'number' },
        submitted_date: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_proposal',
    description: 'Delete a proposal.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
];

export function toolsForUser() {
  return WRITES_ENABLED ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
}

export function writesEnabled() {
  return WRITES_ENABLED;
}

/**
 * Executes a tool call for the given signed-in user. This is the single
 * choke point every tool call passes through - REST routes, this function,
 * and the MCP server (bonus C) all end up calling the same `repo.*`
 * functions, so the access rules can't drift between surfaces.
 */
export function executeTool(user, name, args) {
  let result;
  try {
    result = runTool(user, name, args || {});
  } catch (e) {
    result = { error: e.message || 'Tool error' };
  }
  logToolCall(user, name, args, result);
  return result;
}

function runTool(user, name, args) {
  switch (name) {
    case 'list_opportunities':
      return repo.listOpportunities(user, args);
    case 'get_opportunity': {
      const opportunity = repo.getOpportunity(user, args.id);
      if (!opportunity) {
        return { error: `No opportunity ${args.id} visible to you. It may not exist, or it may belong to a team you cannot see.` };
      }
      const proposals = repo.proposalsForOpportunity(user, args.id);
      return { opportunity, proposals };
    }
    case 'list_accounts':
      return repo.listAccounts(user, args);
    case 'list_proposals':
      return repo.listProposals(user, args);
    case 'pipeline_summary':
      return repo.pipelineSummary(user, args);

    case 'create_opportunity':
      requireWrites();
      return repo.createOpportunity(user, args);
    case 'update_opportunity':
      requireWrites();
      return repo.updateOpportunity(user, args.id, args);
    case 'delete_opportunity':
      requireWrites();
      return repo.deleteOpportunity(user, args.id);
    case 'create_proposal':
      requireWrites();
      return repo.createProposal(user, args);
    case 'update_proposal':
      requireWrites();
      return repo.updateProposal(user, args.id, args);
    case 'delete_proposal':
      requireWrites();
      return repo.deleteProposal(user, args.id);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function requireWrites() {
  if (!WRITES_ENABLED) {
    throw new Error(
      'Write tools are disabled in this deployment (bonus A is off). This assistant can only read data, not create, update, or delete records.'
    );
  }
}

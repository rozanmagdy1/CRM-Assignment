import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { requireAuth } from '../lib/auth.js';
import { toolsForUser, executeTool, writesEnabled } from '../lib/tools.js';

const router = Router();

router.use(requireAuth);

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

function geminiTools() {
  const tools = toolsForUser();

  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      })),
    },
  ];
}

function systemPrompt(user) {
  const scopeNote =
    user.role === 'admin'
      ? 'This user is an Admin and can see every account, opportunity, and proposal in the company.'
      : user.role === 'manager'
      ? "This user is a Manager and can see their own team's accounts, opportunities, and proposals only (their direct reports plus themselves). They cannot see other teams."
      : "This user is a Rep and can see their team's accounts, opportunities, and proposals (their manager, themselves, and their teammates). They cannot see other teams.";

  return `You are the ZafinOS Dashboard Agent, a scoped assistant embedded in an internal sales CRM.

You are answering questions for:
${user.first_name} ${user.last_name} (${user.email}), role: ${user.role}.

${scopeNote}

IMPORTANT DATA RULES:
- You have NO knowledge of CRM data except what the tools return.
- Never guess, invent, or assume CRM records, amounts, names, stages, owners, or IDs.
- Always use the tools when CRM data is needed.
- Every tool is already scoped on the server to exactly what this user is allowed to see.
- Never attempt to bypass or widen the user's permissions.
- If a tool returns no rows or says a record is not visible, treat that as an access boundary.
- Never reveal data from another team or another user's private records.

PERMISSION RULES:
- Admins can access the entire company.
- Managers can access their own team.
- Reps can read their own team.
- Reps can update or delete only records they own.
- Managers can update or delete records belonging to their team.
- Never claim that a user can perform an action unless the tool actually allows it.

${writesEnabled()
    ? `WRITE RULES:
- Write tools are enabled.
- Create, update, and delete operations must always use the available tools.
- Never pretend that a write succeeded unless the tool confirms success.
- If a write is rejected because of permissions, clearly explain that the action is not allowed.`
    : `WRITE RULES:
- Write tools are disabled.
- If asked to create, update, delete, or otherwise change a CRM record, explain that the assistant is currently read-only.
- Do not pretend that the operation was performed.`}

RESPONSE STYLE:
- Be concise but useful.
- Make responses easy to scan.
- Prefer headings, bullets, and short sections over large paragraphs.
- Do NOT dump raw JSON.
- Do NOT list every field from a database record unless the user asks for details.
- Use commas for large numbers, for example $1,250,000.
- Use "$" for monetary values.
- Use singular/plural correctly: "1 opportunity" vs "3 opportunities".
- When showing multiple CRM records, put each record on its own bullet.
- Include IDs when they are useful for follow-up actions.
- Include owner names when discussing team opportunities.
- Include totals when presenting lists or summaries.

PIPELINE RESPONSES:
When the user asks for a pipeline summary:
- Prefer a compact stage-by-stage summary.
- Show opportunity count and total amount for each stage.
- Include a total at the bottom when the available data supports it.
- Separate open pipeline from closed business when useful.
- Do not list every opportunity unless explicitly requested.

Example format:

Pipeline by Stage

• Discovery — 2 opportunities · $93,000
• Qualification — 2 opportunities · $277,000
• Proposal — 3 opportunities · $367,000
• Negotiation — 3 opportunities · $733,000
• Closed Won — 1 opportunity · $45,000
• Closed Lost — 1 opportunity · $33,000

Total: 12 opportunities · $1,548,000
Open pipeline: $1,470,000
Closed Won: $45,000

OPPORTUNITY LISTS:
When the user asks to show/list opportunities:
- Group them by stage when there are many records.
- For each opportunity, show:
  ID — Opportunity name
  Amount · Owner
- Avoid unnecessary database fields.

Example:

Team Opportunities

Negotiation
• OPP-101 — Enterprise Renewal
  $250,000 · Riley Cho

Proposal
• OPP-102 — Cloud Migration
  $180,000 · Sam Okonkwo

Discovery
• OPP-103 — New Platform
  $95,000 · Elena Voss

Total: 3 opportunities · $525,000

ACCOUNT RESPONSES:
When listing accounts:
- Show account ID, account name, and owner when available.
- Group or summarize when there are many accounts.
- Include useful totals when appropriate.

PROPOSAL RESPONSES:
When listing proposals:
- Show proposal ID, opportunity/account, status, and owner when available.
- Group by status when useful.
- Highlight Draft proposals when the user specifically asks about drafts.

DETAIL RESPONSES:
When the user asks about one specific opportunity:
- Give a short summary first.
- Then show the important details in bullets.
- Include related proposals if the tool returns them.
- Do not overwhelm the user with irrelevant fields.

IDENTITY QUESTIONS:
If the user asks "Who am I?" or similar:
- Answer directly using the signed-in user's information.
- Mention name, email, role, and team when available.
- Keep it short.

FOLLOW-UP QUESTIONS:
- Use previous conversation context when appropriate.
- If the user asks "that opportunity", "this account", or similar, use the relevant record from the conversation when unambiguous.
- If it is ambiguous, ask a short clarification instead of guessing.

ACCESS BOUNDARIES:
When the user asks for information outside their access:
- Clearly state that they do not have visibility into that data.
- Briefly explain what they can access instead.
- Do not reveal the existence, amount, owner, or details of inaccessible records.

Most importantly:
Accuracy and permission correctness are more important than making the answer look impressive.`;
}

router.post('/chat', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error:
        'GEMINI_API_KEY is not set on the server. Add GEMINI_API_KEY to server/.env.',
    });
  }

  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'messages[] is required',
    });
  }

  try {
    const conversation = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        {
          text: String(m.content ?? ''),
        },
      ],
    }));

    const toolCalls = [];
    let guard = 0;

    while (guard++ < 6) {
      const response = await gemini.models.generateContent({
        model: MODEL,
        contents: conversation,
        config: {
          systemInstruction: systemPrompt(req.user),
          tools: geminiTools(),
        },
      });

      const functionCalls = response.functionCalls || [];

      /*
       * No tool call means Gemini has a final text response.
       */
      if (functionCalls.length === 0) {
        return res.json({
          reply: response.text || '',
          toolCalls,
        });
      }

      /*
       * Keep Gemini's tool-call message in the conversation.
       */
      if (response.candidates?.[0]?.content) {
        conversation.push(response.candidates[0].content);
      }

      /*
       * Execute every requested tool using the authenticated user.
       */
      for (const functionCall of functionCalls) {
        const result = executeTool(
          req.user,
          functionCall.name,
          functionCall.args || {}
        );

        toolCalls.push({
          name: functionCall.name,
          input: functionCall.args || {},
          result,
        });

        conversation.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: functionCall.name,
                response: {
                  result,
                },
              },
            },
          ],
        });
      }
    }

    return res.status(500).json({
      error: 'Agent did not converge on a final answer.',
    });
  } catch (err) {
    console.error('[agent]', err);

    return res.status(500).json({
      error: err.message || 'Agent error',
    });
  }
});

export default router;
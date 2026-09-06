import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';

import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import opportunityRoutes from './routes/opportunities.js';
import proposalRoutes from './routes/proposals.js';
import agentRoutes from './routes/agent.js';
import auditRoutes from './routes/audit.js';

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // set true behind HTTPS in production
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/audit-log', auditRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`[server] ZafinOS CRM API listening on http://localhost:${PORT}`);
  console.log(
    process.env.GEMINI_API_KEY
      ? '[server] GEMINI_API_KEY detected - dashboard agent is live'
      : '[server] WARNING: GEMINI_API_KEY not set - dashboard agent will error until you add one to server/.env'
  );
});

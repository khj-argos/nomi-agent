import express from 'express';

const app = express();
const PORT = process.env.PORT ?? 4001;

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// TODO: Implement instance routes
// POST   /instances
// DELETE /instances/:userId
// GET    /instances/:userId/status
// GET    /instances/:userId/logs
// POST   /instances/:userId/restart
// PUT    /instances/:userId/config

app.listen(PORT, () => {
  console.log(`Orchestrator running on port ${PORT}`);
});

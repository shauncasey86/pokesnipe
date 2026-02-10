import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import healthRouter from './routes/health.js';
import { catalogRouter } from './routes/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = pino({ name: 'http' });

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(express.json());
app.use(cookieParser());

// Request logging middleware
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, 'request');
  next();
});

app.use(healthRouter);
app.use('/api/catalog', catalogRouter);

// Serve frontend static files
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// Catch-all: serve index.html for client-side routing (Express 5 syntax)
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

export default app;

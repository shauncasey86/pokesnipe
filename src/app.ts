import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import healthRouter from './routes/health.js';

const logger = pino({ name: 'http' });

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Request logging middleware
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, 'request');
  next();
});

app.use(healthRouter);

export default app;

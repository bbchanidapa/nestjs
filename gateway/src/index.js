const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PORT = Number(process.env.PORT || 8080);
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || 'http://localhost:3001';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(morgan('combined'));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const proxyCommon = {
  changeOrigin: true,
  onError: (err, req, res) => {
    res.status(502).json({
      statusCode: 502,
      message: 'Bad gateway',
      details: err.message,
      path: req.originalUrl,
    });
  },
};

const authProxy = createProxyMiddleware({
  ...proxyCommon,
  target: AUTH_SERVICE_URL,
});

const usersProxy = createProxyMiddleware({
  ...proxyCommon,
  target: USERS_SERVICE_URL,
});

const authProxyWithApiPrefix = createProxyMiddleware({
  ...proxyCommon,
  target: AUTH_SERVICE_URL,
  pathRewrite: { '^/api': '' },
});

const usersProxyWithApiPrefix = createProxyMiddleware({
  ...proxyCommon,
  target: USERS_SERVICE_URL,
  pathRewrite: { '^/api': '' },
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    authService: AUTH_SERVICE_URL,
    usersService: USERS_SERVICE_URL,
  });
});

app.use('/auth', authProxy);
app.use('/users', usersProxy);
app.use('/api/auth', authProxyWithApiPrefix);
app.use('/api/users', usersProxyWithApiPrefix);

app.use((req, res) => {
  res.status(404).json({
    statusCode: 404,
    message: 'Route not found',
    path: req.originalUrl,
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API Gateway listening on port ${PORT}`);
});

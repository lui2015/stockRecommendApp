'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const { deviceIdMiddleware } = require('./src/deviceId');
const drawRouter = require('./src/routes/draw');
const historyRouter = require('./src/routes/history');
const analysisRouter = require('./src/routes/analysis');

const app = express();
const PORT = Number(process.env.PORT || 3210);

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(deviceIdMiddleware);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api', drawRouter);
app.use('/api', historyRouter);
app.use('/api', analysisRouter);

app.use(express.static(path.join(__dirname, 'public')));

// 404 兜底：非API 路径统一回退到首页（简单的单页应用兼容），API 路径未匹配则返回 JSON 404
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 统一错误处理，避免向客户端泄露堆栈信息
app.use((err, req, res, next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: '服务异常，请稍后再试' });
});

app.listen(PORT, () => {
  console.log(`求一票 服务已启动：http://localhost:${PORT}`);
});

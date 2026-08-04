'use strict';

/**
 * 腾讯混元大模型（hy3）客户端。
 * 安全要求：
 * - API Key 只从环境变量读取，不接受调用方传入自定义 Key/URL，避免被用作SSRF/凭据滥用出口。
 * - 目标地址固定为 .env 中配置的 HUNYUAN_API_URL，不接受任何外部可控的 URL 拼接。
 */

const HUNYUAN_API_URL = process.env.HUNYUAN_API_URL || 'https://tokenhub.tencentmaas.com/v1/chat/completions';
const HUNYUAN_API_KEY = process.env.HUNYUAN_API_KEY || '';
const HUNYUAN_MODEL = process.env.HUNYUAN_MODEL || 'hy3';
const TIMEOUT_MS = Number(process.env.HUNYUAN_TIMEOUT_MS || 15000);

class HunyuanError extends Error {}

/**
 * 调用混元 chat/completions 接口。
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<string>} 模型返回的文本内容
 */
async function chatCompletion(messages, opts = {}) {
  if (!HUNYUAN_API_KEY) {
    throw new HunyuanError('缺少 HUNYUAN_API_KEY，请在服务端 .env 中配置');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // temperature 默认 0.9，提高“摇一摇”结果的多样性，避免模型总是选最知名的标的
  const temperature = Number.isFinite(opts.temperature) ? opts.temperature : 0.9;

  try {
    const resp = await fetch(HUNYUAN_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUNYUAN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HUNYUAN_MODEL,
        messages,
        stream: false,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new HunyuanError(`混元接口调用失败：HTTP ${resp.status} ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      throw new HunyuanError('混元接口返回内容为空');
    }
    return content;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new HunyuanError('混元接口调用超时');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatCompletion, HunyuanError };

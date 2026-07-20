// Vercel serverless 入口：导出 Express app
// Vercel 的 @vercel/node 会把每个请求交给这个 app 处理
module.exports = require('../server.js');

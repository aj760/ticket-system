const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const { requireLogin, requireAdmin } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ticket-system-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24小时
}));
app.use(express.static(path.join(__dirname, 'public')));

// ============ 认证接口 ============

// 注册
app.post('/api/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: '用户名至少 3 个字符' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 个字符' });
  }
  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ error: '该用户名已被保留' });
  }

  const existing = await db.findUserByName(username);
  if (existing) {
    return res.status(409).json({ error: '用户名已存在' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const avatars = ['🦊', '🐼', '🦉', '🐱', '🐧', '🦄', '🐙', '🦋'];
  const avatar = avatars[Math.floor(Math.random() * avatars.length)];

  const user = await db.createUser(username, hashed, email, avatar);

  req.session.user = { id: user.id, username: user.username, role: user.role, avatar: user.avatar, email: user.email };
  res.json({ success: true, user: req.session.user });
});

// 登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const user = await db.findUserByName(username);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  req.session.user = { id: user.id, username: user.username, role: user.role, avatar: user.avatar, email: user.email };
  res.json({ success: true, user: req.session.user });
});

// 登出
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// 获取当前登录状态
app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.json({ user: null });
  }
});

// ============ 工单接口 ============

// 提交工单
app.post('/api/tickets', requireLogin, async (req, res) => {
  const { title, category, priority, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }

  const ticket = await db.createTicket(
    req.session.user.id,
    req.session.user.username,
    title,
    category || 'other',
    priority || 'normal',
    content
  );

  res.json({ success: true, id: ticket.id });
});

// 获取我的工单
app.get('/api/tickets/mine', requireLogin, async (req, res) => {
  const tickets = await db.getTicketsByUser(req.session.user.id);
  res.json({ tickets });
});

// 获取工单详情
app.get('/api/tickets/:id', requireLogin, async (req, res) => {
  const ticket = await db.getTicketById(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: '工单不存在' });

  // 普通用户只能看自己的
  if (req.session.user.role !== 'admin' && ticket.user_id !== req.session.user.id) {
    return res.status(403).json({ error: '无权访问' });
  }
  res.json({ ticket });
});

// 获取所有工单（管理员）
app.get('/api/admin/tickets', requireAdmin, async (req, res) => {
  const { status, category } = req.query;
  const tickets = await db.getAllTickets({ status, category });
  res.json({ tickets });
});

// 更新工单状态 / 回复（管理员）
app.put('/api/admin/tickets/:id', requireAdmin, async (req, res) => {
  const { status, reply } = req.body;
  const ticket = await db.getTicketById(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: '工单不存在' });

  await db.updateTicket(Number(req.params.id), status, reply, req.session.user.id);
  res.json({ success: true });
});

// 管理员获取统计数据
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  res.json(await db.getStats());
});

// 用户删除自己的工单（仅 pending 状态）
app.delete('/api/tickets/:id', requireLogin, async (req, res) => {
  const ticket = await db.getTicketById(Number(req.params.id));
  if (!ticket) return res.status(404).json({ error: '工单不存在' });
  if (ticket.user_id !== req.session.user.id) return res.status(403).json({ error: '无权操作' });
  if (ticket.status !== 'pending') return res.status(400).json({ error: '工单处理中，无法删除' });

  await db.deleteTicket(Number(req.params.id));
  res.json({ success: true });
});

// ============ 启动（等待数据层就绪）============
(async () => {
  if (db.ready) await db.ready;
  app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║   工单反馈系统已启动                  ║`);
    console.log(`  ║   地址: http://localhost:${PORT}        ║`);
    console.log(`  ║   管理员: admin / admin123           ║`);
    console.log(`  ╚══════════════════════════════════════╝\n`);
  });
})();

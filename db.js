// ============================================
// 数据层：PostgreSQL（生产） / JSON 文件（本地开发）
// 通过 DATABASE_URL 环境变量自动切换
// ============================================
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USE_PG = !!process.env.DATABASE_URL;
let pgPool = null;

const DB_FILE = path.join(__dirname, 'data.json');
let jsonData = { users: [], tickets: [], nextUserId: 1, nextTicketId: 1 };

function now() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

// ---------- JSON 模式辅助 ----------
function loadJson() {
  try {
    if (fs.existsSync(DB_FILE)) {
      jsonData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('JSON 数据加载失败:', e.message);
  }
}

function saveJson() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(jsonData, null, 2), 'utf-8');
  } catch (e) {
    console.error('JSON 数据保存失败:', e.message);
  }
}

// ---------- PG 模式初始化 ----------
async function initPg() {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT DEFAULT '',
      role TEXT DEFAULT 'user',
      avatar TEXT DEFAULT '👤',
      created_at TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT,
      title TEXT,
      category TEXT,
      priority TEXT,
      content TEXT,
      status TEXT DEFAULT 'pending',
      reply TEXT DEFAULT '',
      admin_id INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  const admin = await pgPool.query('SELECT id FROM users WHERE username = $1', ['admin']);
  if (admin.rows.length === 0) {
    const hashed = bcrypt.hashSync('admin123', 10);
    await pgPool.query(
      'INSERT INTO users (username, password, email, role, avatar, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      ['admin', hashed, 'admin@system.local', 'admin', '🛡️', now()]
    );
    console.log('PG: 默认管理员已创建 admin / admin123');
  }
  console.log('PostgreSQL 数据层已就绪');
}

// 启动初始化（PG 模式返回 Promise，JSON 模式同步）
let readyPromise = null;
if (USE_PG) {
  readyPromise = initPg();
} else {
  loadJson();
  if (!jsonData.users.find(u => u.username === 'admin')) {
    const hashed = bcrypt.hashSync('admin123', 10);
    jsonData.users.push({
      id: jsonData.nextUserId++,
      username: 'admin',
      password: hashed,
      email: 'admin@system.local',
      role: 'admin',
      avatar: '🛡️',
      created_at: now()
    });
    saveJson();
    console.log('JSON: 默认管理员已创建 admin / admin123');
  }
}

module.exports = {
  ready: readyPromise,

  // ========== 用户 ==========
  async findUserByName(username) {
    if (USE_PG) {
      const r = await pgPool.query('SELECT * FROM users WHERE username = $1', [username]);
      return r.rows[0] || null;
    }
    return jsonData.users.find(u => u.username === username) || null;
  },

  async createUser(username, hashedPassword, email, avatar) {
    if (USE_PG) {
      const r = await pgPool.query(
        'INSERT INTO users (username, password, email, role, avatar, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [username, hashedPassword, email || '', 'user', avatar || '👤', now()]
      );
      return r.rows[0];
    }
    const user = {
      id: jsonData.nextUserId++,
      username, password: hashedPassword, email: email || '',
      role: 'user', avatar: avatar || '👤', created_at: now()
    };
    jsonData.users.push(user);
    saveJson();
    return user;
  },

  async getUserById(id) {
    if (USE_PG) {
      const r = await pgPool.query('SELECT * FROM users WHERE id = $1', [id]);
      return r.rows[0] || null;
    }
    return jsonData.users.find(u => u.id === id) || null;
  },

  async countUsers() {
    if (USE_PG) {
      const r = await pgPool.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'user'");
      return r.rows[0].c;
    }
    return jsonData.users.filter(u => u.role === 'user').length;
  },

  // ========== 工单 ==========
  async createTicket(userId, username, title, category, priority, content) {
    if (USE_PG) {
      const r = await pgPool.query(
        `INSERT INTO tickets (user_id, username, title, category, priority, content, status, reply, admin_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'pending','',NULL,$7,$7) RETURNING *`,
        [userId, username, title, category, priority, content, now()]
      );
      return r.rows[0];
    }
    const ticket = {
      id: jsonData.nextTicketId++,
      user_id: userId, username, title, category, priority, content,
      status: 'pending', reply: '', admin_id: null,
      created_at: now(), updated_at: now()
    };
    jsonData.tickets.push(ticket);
    saveJson();
    return ticket;
  },

  async getTicketsByUser(userId) {
    if (USE_PG) {
      const r = await pgPool.query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY id DESC', [userId]);
      return r.rows;
    }
    return jsonData.tickets.filter(t => t.user_id === userId).reverse();
  },

  async getTicketById(id) {
    if (USE_PG) {
      const r = await pgPool.query('SELECT * FROM tickets WHERE id = $1', [id]);
      return r.rows[0] || null;
    }
    return jsonData.tickets.find(t => t.id === id) || null;
  },

  async getAllTickets(filters = {}) {
    if (USE_PG) {
      let sql = 'SELECT * FROM tickets WHERE 1=1';
      const params = [];
      let n = 0;
      if (filters.status && filters.status !== 'all') {
        params.push(filters.status); n++; sql += ` AND status = $${n}`;
      }
      if (filters.category && filters.category !== 'all') {
        params.push(filters.category); n++; sql += ` AND category = $${n}`;
      }
      sql += ` ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, id DESC`;
      const r = await pgPool.query(sql, params);
      return r.rows;
    }
    let result = [...jsonData.tickets];
    if (filters.status && filters.status !== 'all') result = result.filter(t => t.status === filters.status);
    if (filters.category && filters.category !== 'all') result = result.filter(t => t.category === filters.category);
    const pOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    result.sort((a, b) => {
      const pa = pOrder[a.priority] ?? 4;
      const pb = pOrder[b.priority] ?? 4;
      if (pa !== pb) return pa - pb;
      return b.id - a.id;
    });
    return result;
  },

  async updateTicket(id, status, reply, adminId) {
    if (USE_PG) {
      const cur = await pgPool.query('SELECT * FROM tickets WHERE id = $1', [id]);
      if (cur.rows.length === 0) return null;
      const t = cur.rows[0];
      // 回复且仍待处理 → 自动改为处理中
      const newStatus = (reply && reply.trim() && t.status === 'pending')
        ? 'processing'
        : (status || t.status);
      const newReply = reply !== undefined ? reply : t.reply;
      await pgPool.query(
        'UPDATE tickets SET status=$1, reply=$2, admin_id=$3, updated_at=$4 WHERE id=$5',
        [newStatus, newReply, adminId || t.admin_id, now(), id]
      );
      return { ...t, status: newStatus, reply: newReply, admin_id: adminId || t.admin_id, updated_at: now() };
    }
    const ticket = jsonData.tickets.find(t => t.id === id);
    if (!ticket) return null;
    if (status) ticket.status = status;
    if (reply !== undefined) ticket.reply = reply;
    if (adminId) ticket.admin_id = adminId;
    if (reply && reply.trim() && ticket.status === 'pending') ticket.status = 'processing';
    ticket.updated_at = now();
    saveJson();
    return ticket;
  },

  async deleteTicket(id) {
    if (USE_PG) {
      const r = await pgPool.query('DELETE FROM tickets WHERE id = $1 RETURNING id', [id]);
      return r.rows.length > 0;
    }
    const idx = jsonData.tickets.findIndex(t => t.id === id);
    if (idx === -1) return false;
    jsonData.tickets.splice(idx, 1);
    saveJson();
    return true;
  },

  // ========== 统计 ==========
  async getStats() {
    if (USE_PG) {
      const r = await pgPool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending,
          COUNT(*) FILTER (WHERE status='processing')::int AS processing,
          COUNT(*) FILTER (WHERE status='resolved')::int AS resolved,
          COUNT(*) FILTER (WHERE status='closed')::int AS closed,
          COUNT(*) FILTER (WHERE priority='urgent' AND status!='closed')::int AS urgent
        FROM tickets
      `);
      const u = await pgPool.query("SELECT COUNT(*)::int AS c FROM users WHERE role='user'");
      return { ...r.rows[0], users: u.rows[0].c };
    }
    const t = jsonData.tickets;
    return {
      total: t.length,
      pending: t.filter(x => x.status === 'pending').length,
      processing: t.filter(x => x.status === 'processing').length,
      resolved: t.filter(x => x.status === 'resolved').length,
      closed: t.filter(x => x.status === 'closed').length,
      users: jsonData.users.filter(u => u.role === 'user').length,
      urgent: t.filter(x => x.priority === 'urgent' && x.status !== 'closed').length
    };
  },

  _now: now
};

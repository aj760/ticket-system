// ============================================
// 公共工具函数与导航栏
// ============================================

const STATUS_MAP = {
  pending: { label: '待处理', class: 'tag-pending', icon: '⏳' },
  processing: { label: '处理中', class: 'tag-processing', icon: '🔧' },
  resolved: { label: '已解决', class: 'tag-resolved', icon: '✅' },
  closed: { label: '已关闭', class: 'tag-closed', icon: '🔒' }
};

const PRIORITY_MAP = {
  urgent: { label: '紧急', class: 'tag-urgent', icon: '🔴' },
  high: { label: '高', class: 'tag-high', icon: '🟠' },
  normal: { label: '普通', class: 'tag-normal', icon: '🔵' },
  low: { label: '低', class: 'tag-low', icon: '⚪' }
};

const CATEGORY_MAP = {
  bug: '🐛 Bug 反馈',
  feature: '💡 功能建议',
  account: '👤 账号问题',
  performance: '⚡ 性能问题',
  ui: '🎨 界面问题',
  other: '📦 其他'
};

// API 请求封装
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

// Toast 通知
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '✅'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// 渲染顶部导航栏
async function renderNavbar(activePage) {
  const { user } = await api('/api/me');
  const nav = document.getElementById('navbar');
  if (!nav) return;

  let links = '';
  if (user) {
    if (user.role === 'admin') {
      links = `
        <a href="/pages/admin.html" class="nav-link ${activePage === 'admin' ? 'active' : ''}">⚙️ 管理面板</a>
        <a href="/pages/submit.html" class="nav-link ${activePage === 'submit' ? 'active' : ''}">✏️ 提交反馈</a>
        <a href="/pages/my-tickets.html" class="nav-link ${activePage === 'my' ? 'active' : ''}">📋 我的工单</a>
      `;
    } else {
      links = `
        <a href="/pages/submit.html" class="nav-link ${activePage === 'submit' ? 'active' : ''}">✏️ 提交反馈</a>
        <a href="/pages/my-tickets.html" class="nav-link ${activePage === 'my' ? 'active' : ''}">📋 我的工单</a>
      `;
    }
  } else {
    links = `<a href="/#features" class="nav-link">✨ 功能</a><a href="/#stats" class="nav-link">📊 数据</a>`;
  }

  let userArea = '';
  if (user) {
    userArea = `
      <div class="user-chip" onclick="logout()" style="cursor:pointer">
        <div class="avatar">${user.avatar || '👤'}</div>
        <span class="uname">${user.username}</span>
        ${user.role === 'admin' ? '<span class="badge-admin">管理员</span>' : ''}
      </div>
    `;
  } else {
    userArea = `
      <a href="/pages/login.html" class="btn btn-ghost btn-sm">登录</a>
      <a href="/pages/register.html" class="btn btn-primary btn-sm">注册</a>
    `;
  }

  nav.innerHTML = `
    <div class="nav-inner">
      <a href="/" class="logo">
        <div class="logo-icon">🎫</div>
        <div class="logo-text">工单<span>反馈</span></div>
      </a>
      <div class="nav-links">
        ${links}
        ${userArea}
      </div>
    </div>
  `;
}

// 登出
async function logout() {
  await api('/api/logout', { method: 'POST' });
  showToast('已安全退出', 'info');
  setTimeout(() => location.href = '/', 800);
}

// 需要登录的页面守卫
async function requireAuth(needAdmin = false) {
  const { user } = await api('/api/me');
  if (!user) {
    showToast('请先登录', 'error');
    setTimeout(() => location.href = '/pages/login.html', 1000);
    return null;
  }
  if (needAdmin && user.role !== 'admin') {
    showToast('需要管理员权限', 'error');
    setTimeout(() => location.href = '/', 1000);
    return null;
  }
  return user;
}

// 渲染工单卡片
function renderTicketCard(ticket, showUser = false) {
  const status = STATUS_MAP[ticket.status] || STATUS_MAP.pending;
  const priority = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.normal;
  const category = CATEGORY_MAP[ticket.category] || '📦 其他';

  let replyHtml = '';
  if (ticket.reply) {
    replyHtml = `<div class="ticket-reply-box"><strong>💬 管理员回复：</strong>${escapeHtml(ticket.reply)}</div>`;
  }

  let userHtml = '';
  if (showUser) {
    userHtml = `<span>👤 ${escapeHtml(ticket.username)}</span>`;
  }

  return `
    <div class="ticket-card" onclick="openTicketDetail(${ticket.id})">
      <div class="ticket-card-top">
        <span class="ticket-id">#${String(ticket.id).padStart(4, '0')}</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="tag ${priority.class}">${priority.icon} ${priority.label}</span>
          <span class="tag ${status.class}">${status.icon} ${status.label}</span>
        </div>
      </div>
      <div class="ticket-title">${escapeHtml(ticket.title)}</div>
      <div class="ticket-content">${escapeHtml(ticket.content)}</div>
      <div class="ticket-meta">
        <span>📦 ${category}</span>
        ${userHtml}
        <span>🕐 ${ticket.created_at}</span>
      </div>
      ${replyHtml}
    </div>
  `;
}

// HTML 转义
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 打开工单详情（子页面可覆盖）
function openTicketDetail(id) {
  if (window.handleTicketDetail) {
    window.handleTicketDetail(id);
  }
}

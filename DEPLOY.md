# 工单反馈系统 · 部署到自有域名指南

目标：让 `xingmu.l2.ink` 永久、稳定、带 HTTPS 地访问你的工单系统。
方案：Render（免费云平台）部署应用 + Neon（免费 PostgreSQL）存数据 + l2.ink CNAME 绑定域名。

---

## 第一步：注册 Neon 数据库（免费 PostgreSQL）

Neon 提供免费的云 PostgreSQL 数据库，用来持久化工单数据。

1. 打开 https://neon.tech ，点 **Sign up**，用 GitHub 或 Google 账号登录
2. 登录后点 **Create New Project**，名称填 `ticket`，Region 选最近的（如 `AWS Asia Pacific (Singapore)`）
3. 创建完成后，页面会显示一段 **Connection String**，形如：
   ```
   postgresql://ticket_user:xxxxxxxx@ep-xxx.ap-southeast-1.aws.neon.tech/ticketdb?sslmode=require
   ```
4. **复制这段连接串保存好**（后面要用），点 "Done"

---

## 第二步：把代码推到 GitHub

代码已经初始化好 git 仓库，直接推到 GitHub 即可。

1. 打开 https://github.com ，注册/登录账号
2. 点右上角 **+ → New repository**，名称填 `ticket-system`，选 **Private**（私有），点 Create
3. 在本仓库目录执行（替换成你自己的 GitHub 地址）：
   ```bash
   cd "C:/Users/Administrator/WorkBuddy/2026-07-20-14-52-51/ticket-system"
   git remote add origin https://github.com/你的用户名/ticket-system.git
   git branch -M main
   git push -u origin main
   ```
   （如果用 HTTPS 推送会要求输入 GitHub 账号密码，建议用 Personal Access Token）

---

## 第三步：在 Render 部署应用

1. 打开 https://render.com ，点 **Get Started**，用 GitHub 账号登录
2. 授权 Render 访问你的 GitHub 仓库 `ticket-system`
3. 点 **New + → Blueprint**
4. 选择 `ticket-system` 仓库，Render 会自动识别 `render.yaml` 配置
5. 在环境变量填写界面，找到 `DATABASE_URL`，把 **第一步复制的 Neon 连接串** 粘贴进去
6. 点 **Apply**，Render 开始自动构建部署（约 2-3 分钟）
7. 部署完成后，Render 会给你一个地址，形如：
   ```
   https://ticket-feedback-system-xxxx.onrender.com
   ```
8. 打开这个地址，确认工单系统能正常访问、能登录（admin / admin123）

---

## 第四步：绑定你的域名 xingmu.l2.ink

1. 在 Render 的 Web Service 页面，左侧点 **Settings**
2. 找到 **Custom Domains**，点 **Add Custom Domain**
3. 输入 `xingmu.l2.ink`，点 Add
4. Render 会显示一段 **CNAME 目标**，形如 `ticket-feedback-system-xxxx.onrender.com`
5. 登录 **l2.ink 后台**，找到 `xingmu` 这个子域名的 DNS 管理
6. 添加一条 **CNAME 记录**：
   - 主机记录 / 名称：`xingmu`（或按 l2.ink 要求填）
   - 记录类型：`CNAME`
   - 记录值 / 目标：`ticket-feedback-system-xxxx.onrender.com`（填 Render 给你的值）
   - TTL：默认即可
7. 保存，等待 DNS 生效（通常几分钟到几十分钟）
8. 回到 Render 的 Custom Domains 页面，状态变绿 **Verified** 即成功
9. Render 会自动为 `xingmu.l2.ink` 配置 HTTPS 证书

---

## 第五步：访问验证

打开 `https://xingmu.l2.ink`，应该能看到你的工单系统，地址栏有 HTTPS 锁标。
把这个链接发给任何人，都能稳定访问了。

---

## 常见问题

**Q: Render 免费版会休眠吗？**
A: 15 分钟无访问会休眠，下次访问约 30 秒唤醒。工单系统访问量不大时影响很小。如需不休眠可升级付费版。

**Q: 数据会丢失吗？**
A: 不会。数据存在 Neon PostgreSQL，与 Render 应用独立，应用重启/休眠都不影响数据。

**Q: 管理员账号是什么？**
A: `admin` / `admin123`，系统启动时自动创建。建议部署后立即修改密码。

**Q: 部署后本地还能开发吗？**
A: 可以。本地不设 `DATABASE_URL` 环境变量，会自动用 JSON 文件存储（开发模式）；Render 上设了 `DATABASE_URL` 就用 PostgreSQL（生产模式）。

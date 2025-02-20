# Azure DevOps Workload View

A web application for visualizing team workload distribution in Azure DevOps.

## 安全说明

⚠️ **重要提示**：
- 永远不要将 `config.js` 提交到版本控制系统
- 不要在代码中硬编码 PAT 或其他敏感信息
- 定期更换 PAT 令牌
- 使用最小权限原则配置 PAT

## 离线部署准备

1. 下载所需的第三方库文件到 `wwwroot/lib/` 目录：

   ```bash
   # 创建 lib 目录
   mkdir -p wwwroot/lib
   
   # 下载 Vue.js
   curl -o wwwroot/lib/vue.global.prod.js https://cdn.jsdelivr.net/npm/vue@3.2.31/dist/vue.global.prod.js
   
   # 下载 Chart.js
   curl -o wwwroot/lib/chart.umd.min.js https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.min.js
   
   # 下载 Tailwind CSS
   curl -o wwwroot/lib/tailwind.min.css https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css
   ```

   或者手动下载以下文件并放入 `wwwroot/lib/` 目录：
   - Vue.js: https://cdn.jsdelivr.net/npm/vue@3.2.31/dist/vue.global.prod.js
   - Chart.js: https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.min.js
   - Tailwind CSS: https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css

## 配置说明

1. 复制配置文件模板：
   ```bash
   cp config.example.js wwwroot/js/config.js
   ```

2. 编辑 `wwwroot/js/config.js` 配置文件：
   - `serverUrl`: Azure DevOps Server 地址
   - `collection`: Collection 名称（例如：'DefaultCollection'）
   - `pat`: Personal Access Token

   > **注意**：不要将 `config.js` 提交到版本控制系统中

3. 生成 Personal Access Token (PAT)：
   - 访问 Azure DevOps > 用户设置 > Personal Access Tokens
   - 创建新的 token，需要以下权限：
     - Work Items (Read)
     - Project and Team (Read)
   - 将生成的 token 复制到 `config.js` 中

## 部署说明

1. 将整个项目目录复制到内网服务器
2. 配置 Web 服务器（如 IIS、Nginx）指向 `wwwroot` 目录
3. 确保所有文件的访问权限正确

### IIS 配置示例

1. 在 IIS 中创建新网站或应用程序
2. 物理路径指向项目的 `wwwroot` 目录
3. 配置应用程序池（建议使用集成模式）
4. 确保 MIME 类型配置正确

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your_domain.com;

    root /path/to/your/wwwroot;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 功能特性

- 项目和团队选择
- 实时工作负载可视化
- 可配置的 Azure DevOps 连接设置
- 安全的凭据管理

## 技术栈

- Vue.js 3.2.31
- Chart.js
- Tailwind CSS 2.2.19
- Azure DevOps REST API v6.0 
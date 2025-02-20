# Azure DevOps 团队工作负载查看器

一个基于 Web 的工具，用于可视化和管理 Azure DevOps 团队的工作负载分布。

## 安全说明

⚠️ **重要提示**：

- 永远不要将 `config.js` 提交到版本控制系统
- 不要在代码中硬编码 PAT 或其他敏感信息
- 定期更换 PAT 令牌
- 使用最小权限原则配置 PAT

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

## 功能特点

- 项目和团队筛选

  - 支持查看单个项目或所有项目
  - 支持查看单个团队或所有团队
  - 默认选择"全部项目"和"全部团队"

- 工作项过滤

  - 可选择仅显示已定义目标日期的工作项（默认开启）
  - 自动过滤已关闭和已删除的工作项

- 数据可视化

  - 使用堆叠柱状图展示团队成员的工作项分布
  - 按工作项状态（新建、进行中、待评审、已解决）进行颜色区分
  - 支持图表交互和数据提示

- 详细数据展示
  - 按成员分组显示工作项详情
  - 显示工作项的完整信息（ID、标题、状态、优先级等）
  - 工作项延期状态自动计算和显示
  - 成员工作项按延期状态优先级排序

## 技术栈

- Vue.js 3
- Tailwind CSS
- Chart.js
- Azure DevOps REST API

## 使用说明

1. 页面加载时自动获取所有可用项目
2. 选择项目后自动加载对应团队
3. 可通过复选框控制是否只显示有目标日期的工作项
4. 点击"加载数据"按钮获取工作负载数据
5. 数据以图表和表格两种形式展示
6. 表格中的工作项按延期状态排序展示

## 工作项状态说明

- 正常：未超过目标日期
- 即将到期：目标日期在 24 小时内
- 已延期：已超过目标日期
- 对于已解决的工作项，始终显示为正常状态

## 注意事项

1. 需要确保 PAT (Personal Access Token) 具有足够的权限
2. 大量数据加载可能需要较长时间
3. 建议使用现代浏览器以获得最佳体验

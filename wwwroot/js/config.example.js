// 配置文件示例 - 复制此文件到 config.js 并更新配置
const config = {
    // Azure DevOps Server URL
    serverUrl: 'http://your-azure-devops-server',
    
    // Collection name (默认: DefaultCollection)
    collection: 'DefaultCollection',
    
    // Personal Access Token (PAT)
    // 从 Azure DevOps 生成: 用户设置 > Personal Access Tokens
    // 所需权限:
    // - Work Items (Read)
    // - Project and Team (Read)
    pat: 'your-pat-token-here'
}; 
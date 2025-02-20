const { createApp } = Vue

const app = createApp({
    data() {
        return {
            serverUrl: config.serverUrl,
            collection: config.collection,
            pat: config.pat,
            project: '',
            team: '',
            projects: [],
            teams: [],
            workloadData: null,
            loading: false,
            error: null,
            chart: null
        }
    },
    methods: {
        getAuthHeaders() {
            const auth = btoa(`:${this.pat}`);
            return {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
        },
        async fetchApi(url, options = {}) {
            try {
                const baseUrl = `${this.serverUrl}/${this.collection}`;
                const apiVersion = 'api-version=6.0';
                const fullUrl = `${baseUrl}${url}${url.includes('?') ? '&' : '?'}${apiVersion}`;

                console.log('Fetching:', fullUrl);

                const response = await fetch(fullUrl, {
                    ...options,
                    headers: this.getAuthHeaders()
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('API Error:', errorText);
                    throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
                }

                const data = await response.json();
                console.log('API Response:', data);
                return data;
            } catch (err) {
                console.error('Fetch Error:', err);
                throw err;
            }
        },
        async loadProjects() {
            try {
                this.loading = true;
                this.error = null;

                const data = await this.fetchApi('/_apis/projects');
                
                if (!data || !data.value) {
                    throw new Error('返回的数据格式不正确');
                }

                this.projects = data.value.map(proj => ({
                    id: proj.id,
                    name: proj.name,
                    description: proj.description
                }));

                console.log('Loaded projects:', this.projects);
            } catch (err) {
                console.error('Load projects error:', err);
                this.error = `加载项目失败: ${err.message}`;
                this.projects = [];
            } finally {
                this.loading = false;
            }
        },
        async loadTeams() {
            if (!this.project) return;
            
            try {
                this.loading = true;
                this.error = null;

                const data = await this.fetchApi(`/_apis/projects/${this.project}/teams`);
                
                if (!data || !data.value) {
                    throw new Error('返回的团队数据格式不正确');
                }

                this.teams = data.value.map(team => ({
                    id: team.id,
                    name: team.name,
                    description: team.description
                }));

                console.log('Loaded teams:', this.teams);
            } catch (err) {
                console.error('Load teams error:', err);
                this.error = `加载团队失败: ${err.message}`;
                this.teams = [];
            } finally {
                this.loading = false;
            }
        },
        async fetchWorkItemsBatch(ids) {
            // 每批次最多处理200个工作项
            const batchSize = 200;
            const batches = [];
            
            for (let i = 0; i < ids.length; i += batchSize) {
                const batchIds = ids.slice(i, i + batchSize);
                batches.push(batchIds);
            }

            const allItems = [];
            for (const batch of batches) {
                const batchIds = batch.join(',');
                const response = await this.fetchApi(
                    `/_apis/wit/workitems?ids=${batchIds}&fields=System.Id,System.Title,System.AssignedTo,System.State,System.WorkItemType,System.Description,System.CreatedDate,System.CreatedBy,System.ChangedDate,System.ChangedBy,Microsoft.VSTS.Common.Priority,System.AreaPath,System.IterationPath`
                );
                if (response && response.value) {
                    allItems.push(...response.value);
                }
            }
            
            return allItems;
        },
        async loadWorkload() {
            if (!this.project || !this.team) {
                this.error = '请选择项目和团队';
                return;
            }

            this.loading = true;
            this.error = null;

            try {
                // 1. 获取团队成员
                const membersResponse = await this.fetchApi(
                    `/_apis/projects/${this.project}/teams/${this.team}/members`
                );
                
                console.log('Team members response:', membersResponse);

                // 2. 获取所有工作项ID
                const allWorkItems = [];
                let continuationToken = null;
                
                do {
                    const wiqlQuery = {
                        query: `SELECT [System.Id],
                                      [System.Title],
                                      [System.AssignedTo],
                                      [System.State],
                                      [System.WorkItemType],
                                      [System.Description],
                                      [System.CreatedDate],
                                      [System.CreatedBy],
                                      [System.ChangedDate],
                                      [System.ChangedBy],
                                      [Microsoft.VSTS.Common.Priority],
                                      [System.AreaPath],
                                      [System.IterationPath]
                               FROM WorkItems
                               WHERE [System.TeamProject] = '${this.project}'
                               AND [System.WorkItemType] = '用户情景'
                               AND [System.State] <> '已关闭'
                               AND [System.State] <> '已解决'
                               AND [System.State] <> '已删除'
                               ORDER BY [System.ChangedDate] DESC`,
                        ...(continuationToken && { continuationToken })
                    };

                    const workItemsResponse = await this.fetchApi(
                        `/${this.project}/_apis/wit/wiql`,
                        {
                            method: 'POST',
                            body: JSON.stringify(wiqlQuery)
                        }
                    );

                    if (workItemsResponse.workItems) {
                        allWorkItems.push(...workItemsResponse.workItems);
                    }

                    continuationToken = workItemsResponse.continuationToken;
                } while (continuationToken);

                console.log(`Total work items found: ${allWorkItems.length}`);

                // 3. 处理数据
                const workloadData = {};

                // 初始化每个团队成员的数据
                if (membersResponse && membersResponse.value) {
                    membersResponse.value.forEach(member => {
                        const memberName = member.identity?.displayName || member.identity?.uniqueName || '未知成员';
                        workloadData[memberName] = {
                            total: 0,
                            assigned: []
                        };
                    });
                }

                // 分批获取工作项详细信息
                if (allWorkItems.length > 0) {
                    const workItemIds = allWorkItems.map(wi => wi.id);
                    const detailedItems = await this.fetchWorkItemsBatch(workItemIds);

                    detailedItems.forEach(item => {
                        const assignedTo = item.fields['System.AssignedTo']?.displayName;
                        if (assignedTo && workloadData[assignedTo]) {
                            workloadData[assignedTo].total++;
                            workloadData[assignedTo].assigned.push({
                                id: item.id,
                                title: item.fields['System.Title'],
                                type: item.fields['System.WorkItemType'],
                                state: item.fields['System.State'],
                                description: item.fields['System.Description'],
                                createdDate: new Date(item.fields['System.CreatedDate']).toLocaleDateString(),
                                createdBy: item.fields['System.CreatedBy']?.displayName,
                                changedDate: new Date(item.fields['System.ChangedDate']).toLocaleDateString(),
                                changedBy: item.fields['System.ChangedBy']?.displayName,
                                priority: item.fields['Microsoft.VSTS.Common.Priority'],
                                areaPath: item.fields['System.AreaPath'],
                                iterationPath: item.fields['System.IterationPath']
                            });
                        }
                    });
                }

                console.log('Processed workload data:', workloadData);
                this.workloadData = workloadData;

                this.$nextTick(() => {
                    this.updateChart();
                });
            } catch (err) {
                console.error('Load workload error:', err);
                this.error = `加载工作负载数据失败: ${err.message}`;
                this.workloadData = null;
            } finally {
                this.loading = false;
            }
        },
        updateChart() {
            const ctx = document.getElementById('workloadChart');
            
            if (this.chart) {
                this.chart.destroy();
            }

            const labels = Object.keys(this.workloadData);
            const data = labels.map(member => this.workloadData[member].total);

            this.chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '分配的工作项数量',
                        data: data,
                        backgroundColor: 'rgba(59, 130, 246, 0.5)',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        }
    },
    mounted() {
        // 初始化时立即加载项目列表
        if (this.serverUrl && this.pat) {
            this.loadProjects();
        }

        // 监听配置变化
        this.$watch(
            () => [this.serverUrl, this.pat],
            () => {
                if (this.serverUrl && this.pat) {
                    this.loadProjects();
                }
            }
        );
    }
})

app.mount('#app') 
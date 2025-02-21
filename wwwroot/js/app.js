// 格式化日期
function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// 计算延期状态
function calculateDelayStatus(targetDateStr, state) {
  // 如果状态是已解决，直接返回正常
  if (state === "已解决") {
    return { status: "normal", text: "正常" };
  }

  if (!targetDateStr || targetDateStr === "-")
    return { status: "normal", text: "正常" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 解析日期 "2025/02/19" 格式
  const [year, month, day] = targetDateStr
    .split("/")
    .map((num) => parseInt(num, 10));
  const targetDate = new Date(year, month - 1, day); // 月份需要减1因为Date对象中月份是0-11
  targetDate.setHours(0, 0, 0, 0);

  if (targetDate < today) {
    return { status: "delayed", text: "已延期" };
  } else if (targetDate <= tomorrow) {
    return { status: "warning", text: "即将到期" };
  } else {
    return { status: "normal", text: "正常" };
  }
}

// 获取延期状态优先级
function getDelayStatusPriority(status) {
  switch (status) {
    case "delayed":
      return 1; // 已延期优先级最高
    case "warning":
      return 2; // 即将到期其次
    case "normal":
      return 3; // 正常优先级最低
    default:
      return 4;
  }
}

// 处理工作项数据
function processWorkItem(item) {
  const targetDate = formatDate(
    item.fields["Microsoft.VSTS.Scheduling.TargetDate"]
  );
  const state = item.fields["System.State"] || "未知";
  const delayStatus = calculateDelayStatus(targetDate, state);

  return {
    id: item.id,
    title: item.fields["System.Title"] || "无标题",
    description: item.fields["System.Description"] || "",
    state: state,
    priority: item.fields["Microsoft.VSTS.Common.Priority"] || "-",
    startDate: formatDate(item.fields["Microsoft.VSTS.Scheduling.StartDate"]),
    targetDate: targetDate,
    delayStatus: delayStatus,
    changedDate: formatDate(item.fields["System.ChangedDate"]),
    changedBy: item.fields["System.ChangedBy"]?.displayName || "-",
    assignedTo: item.fields["System.AssignedTo"]?.displayName || "未分配",
  };
}

const { createApp } = Vue;

const app = createApp({
  data() {
    return {
      serverUrl: config.serverUrl,
      collections: config.collections,
      project: "",
      team: "",
      projects: [],
      teams: [],
      workloadData: null,
      loading: false,
      error: null,
      chart: null,
      hasTargetDate: true,
      memberSearch: "",
    };
  },
  computed: {
    sortedMembers() {
      if (!this.workloadData) return [];
      return Object.entries(this.workloadData)
        .filter(([, data]) => data.total > 0)
        .sort(([, a], [, b]) => a.total - b.total)
        .map(([member]) => member);
    },
    filteredMembers() {
      if (!this.memberSearch) {
        return this.sortedMembers;
      }
      const searchTerm = this.memberSearch.toLowerCase();
      return this.sortedMembers.filter(member => 
        member.toLowerCase().includes(searchTerm)
      );
    }
  },
  watch: {
    filteredMembers: {
      handler() {
        this.$nextTick(() => {
          this.updateChart();
        });
      }
    }
  },
  methods: {
    getAuthHeaders(collection) {
      const auth = btoa(`:${collection.pat}`);
      return {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
    },
    async fetchApi(collection, url, options = {}) {
      try {
        const baseUrl = `${this.serverUrl}/${collection.name}`;
        const apiVersion = "api-version=6.0";
        const fullUrl = `${baseUrl}${url}${
          url.includes("?") ? "&" : "?"
        }${apiVersion}`;

        console.log("Fetching:", fullUrl);

        const response = await fetch(fullUrl, {
          ...options,
          headers: this.getAuthHeaders(collection),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error:", errorText);
          throw new Error(
            `HTTP error! status: ${response.status}, details: ${errorText}`
          );
        }

        const data = await response.json();
        console.log("API Response:", data);
        return data;
      } catch (err) {
        console.error("Fetch Error:", err);
        throw err;
      }
    },
    async loadProjects() {
      try {
        this.loading = true;
        this.error = null;

        const allProjects = [];
        
        // 从每个 collection 获取项目
        for (const collection of this.collections) {
          try {
            const data = await this.fetchApi(collection, "/_apis/projects");
            if (data && data.value) {
              // 为每个项目添加 collection 信息
              const projectsWithCollection = data.value.map(proj => ({
                id: proj.id,
                name: proj.name,
                description: proj.description,
                collection: collection.name
              }));
              allProjects.push(...projectsWithCollection);
            }
          } catch (err) {
            console.error(`Error loading projects from collection ${collection.name}:`, err);
            // 继续处理其他 collection
          }
        }

        // 添加"全部项目"选项
        this.projects = [
          { id: "all", name: "全部项目", description: "显示所有项目" },
          ...allProjects
        ];

        console.log("Loaded projects:", this.projects);

        // 默认选择"全部项目"
        this.project = "all";
        // 加载团队
        await this.loadTeams();
      } catch (err) {
        console.error("Load projects error:", err);
        this.error = `加载项目失败: ${err.message}`;
        this.projects = [];
      } finally {
        this.loading = false;
      }
    },
    async loadTeams() {
      try {
        this.loading = true;
        this.error = null;

        const allTeams = [];

        if (this.project === "all") {
          // 如果选择了"全部项目"，则获取所有 collection 中所有项目的所有团队
          for (const collection of this.collections) {
            for (const proj of this.projects) {
              if (proj.id === "all") continue;
              if (proj.collection !== collection.name) continue;

              try {
                const data = await this.fetchApi(
                  collection,
                  `/_apis/projects/${proj.name}/teams`
                );
                if (data && data.value) {
                  allTeams.push(
                    ...data.value.map((team) => ({
                      ...team,
                      projectName: proj.name,
                      collection: collection.name
                    }))
                  );
                }
              } catch (err) {
                console.error(`Error loading teams for project ${proj.name} in collection ${collection.name}:`, err);
                // 继续处理其他项目
              }
            }
          }
        } else {
          // 获取特定项目的团队
          const selectedProject = this.projects.find(
            (p) => p.id === this.project
          );
          if (!selectedProject) {
            throw new Error("未找到选中的项目");
          }

          const collection = this.collections.find(c => c.name === selectedProject.collection);
          if (!collection) {
            throw new Error("未找到项目对应的 collection");
          }

          const data = await this.fetchApi(
            collection,
            `/_apis/projects/${selectedProject.name}/teams`
          );

          if (data && data.value) {
            allTeams.push(
              ...data.value.map((team) => ({
                ...team,
                projectName: selectedProject.name,
                collection: collection.name
              }))
            );
          }
        }

        // 添加"全部团队"选项
        this.teams = [
          { id: "all", name: "全部团队", description: "显示所有团队" },
          ...allTeams.map((team) => ({
            id: team.id,
            name: team.name,
            description: team.description,
            projectName: team.projectName,
            collection: team.collection
          }))
        ];

        // 默认选择"全部团队"
        this.team = "all";

        // 自动加载数据
        await this.loadWorkload();

        console.log("Loaded teams:", this.teams);
      } catch (err) {
        console.error("Load teams error:", err);
        this.error = `加载团队失败: ${err.message}`;
        this.teams = [];
      } finally {
        this.loading = false;
      }
    },
    async fetchWorkItemsBatch(collection, ids) {
      const batchSize = 200;
      const batches = [];

      for (let i = 0; i < ids.length; i += batchSize) {
        const batchIds = ids.slice(i, i + batchSize);
        batches.push(batchIds);
      }

      const allItems = [];
      for (const batch of batches) {
        const batchIds = batch.join(",");
        const response = await this.fetchApi(
          collection,
          `/_apis/wit/workitems?ids=${batchIds}&fields=System.Id,System.Title,System.AssignedTo,System.State,System.WorkItemType,System.Description,System.CreatedDate,System.CreatedBy,System.ChangedDate,System.ChangedBy,Microsoft.VSTS.Common.Priority,System.AreaPath,System.IterationPath,Microsoft.VSTS.Scheduling.StartDate,Microsoft.VSTS.Scheduling.TargetDate,Microsoft.VSTS.Common.StateChangeDate`
        );
        if (response && response.value) {
          allItems.push(...response.value);
        }
      }

      return allItems;
    },
    async loadWorkload() {
      if (!this.project) {
        this.error = "请选择项目";
        return;
      }

      try {
        this.loading = true;
        this.error = null;

        // 1. 获取团队成员
        let allMembers = new Set();

        for (const collection of this.collections) {
          if (this.project === "all") {
            // 如果选择了全部项目，获取所有项目的所有团队成员
            for (const proj of this.projects) {
              if (proj.id === "all" || proj.collection !== collection.name) continue;

              if (this.team === "all") {
                // 如果选择了全部团队，获取项目的所有团队成员
                try {
                  const teams = await this.fetchApi(
                    collection,
                    `/_apis/projects/${proj.name}/teams`
                  );
                  if (teams && teams.value) {
                    for (const team of teams.value) {
                      const membersResponse = await this.fetchApi(
                        collection,
                        `/_apis/projects/${proj.name}/teams/${team.name}/members`
                      );
                      if (membersResponse && membersResponse.value) {
                        membersResponse.value.forEach((member) => {
                          const memberName =
                            member.identity?.displayName ||
                            member.identity?.uniqueName ||
                            "未知成员";
                          allMembers.add(memberName);
                        });
                      }
                    }
                  }
                } catch (err) {
                  console.error(`Error loading members for project ${proj.name} in collection ${collection.name}:`, err);
                  // 继续处理其他项目
                }
              } else {
                // 获取特定团队的成员
                const selectedTeam = this.teams.find((t) => t.id === this.team);
                if (!selectedTeam || selectedTeam.collection !== collection.name || selectedTeam.projectName !== proj.name) continue;

                try {
                  const membersResponse = await this.fetchApi(
                    collection,
                    `/_apis/projects/${proj.name}/teams/${selectedTeam.name}/members`
                  );
                  if (membersResponse && membersResponse.value) {
                    membersResponse.value.forEach((member) => {
                      const memberName =
                        member.identity?.displayName ||
                        member.identity?.uniqueName ||
                        "未知成员";
                      allMembers.add(memberName);
                    });
                  }
                } catch (err) {
                  console.error(`Error loading members for team ${selectedTeam.name} in project ${proj.name}:`, err);
                }
              }
            }
          } else {
            // 获取特定项目的团队成员
            const selectedProject = this.projects.find(
              (p) => p.id === this.project
            );
            if (!selectedProject || selectedProject.collection !== collection.name) continue;

            if (this.team === "all") {
              // 如果选择了全部团队，获取项目的所有团队成员
              const teams = await this.fetchApi(
                collection,
                `/_apis/projects/${selectedProject.name}/teams`
              );
              if (teams && teams.value) {
                for (const team of teams.value) {
                  const membersResponse = await this.fetchApi(
                    collection,
                    `/_apis/projects/${selectedProject.name}/teams/${team.name}/members`
                  );
                  if (membersResponse && membersResponse.value) {
                    membersResponse.value.forEach((member) => {
                      const memberName =
                        member.identity?.displayName ||
                        member.identity?.uniqueName ||
                        "未知成员";
                      allMembers.add(memberName);
                    });
                  }
                }
              }
            } else {
              // 获取特定团队的成员
              const selectedTeam = this.teams.find((t) => t.id === this.team);
              if (!selectedTeam) continue;

              const membersResponse = await this.fetchApi(
                collection,
                `/_apis/projects/${selectedProject.name}/teams/${selectedTeam.name}/members`
              );
              if (membersResponse && membersResponse.value) {
                membersResponse.value.forEach((member) => {
                  const memberName =
                    member.identity?.displayName ||
                    member.identity?.uniqueName ||
                    "未知成员";
                  allMembers.add(memberName);
                });
              }
            }
          }
        }

        // 2. 初始化数据结构
        const workloadData = {};
        allMembers.forEach((memberName) => {
          workloadData[memberName] = {
            total: 0,
            assigned: [],
          };
        });

        // 3. 获取工作项
        for (const collection of this.collections) {
          let projectCondition = "";
          let areaPathCondition = "";
          
          if (this.project !== "all") {
            const selectedProject = this.projects.find(
              (p) => p.id === this.project
            );
            if (!selectedProject || selectedProject.collection !== collection.name) continue;
            projectCondition = `AND [System.TeamProject] = '${selectedProject.name}'`;

            if (this.team !== "all") {
              const selectedTeam = this.teams.find((t) => t.id === this.team);
              if (selectedTeam) {
                // 使用团队的 AreaPath 进行过滤
                areaPathCondition = `AND [System.AreaPath] UNDER '${selectedProject.name}\\${selectedTeam.name}'`;
              }
            }
          }

          // 添加目标日期条件
          const targetDateCondition = this.hasTargetDate
            ? "AND [Microsoft.VSTS.Scheduling.TargetDate] <> ''"
            : "";

          const wiqlQuery = {
            query: `SELECT [System.Id]
                             FROM WorkItems
                             WHERE [System.WorkItemType] = '用户情景'
                             ${projectCondition}
                             ${areaPathCondition}
                             ${targetDateCondition}
                             AND [System.State] <> '已关闭'
                             AND [System.State] <> '已删除'
                             ORDER BY [System.State] ASC, [Microsoft.VSTS.Common.Priority] ASC`,
          };

          try {
            // 获取所有工作项ID
            const workItemsResponse = await this.fetchApi(
              collection,
              `/_apis/wit/wiql?api-version=6.0`,
              {
                method: "POST",
                body: JSON.stringify(wiqlQuery),
              }
            );

            if (workItemsResponse.workItems && workItemsResponse.workItems.length > 0) {
              const workItemIds = workItemsResponse.workItems.map((wi) => wi.id);
              const detailedItems = await this.fetchWorkItemsBatch(collection, workItemIds);

              detailedItems.forEach((item) => {
                const processedItem = processWorkItem(item);
                // 添加项目、团队和collection信息
                processedItem.projectName = item.fields["System.TeamProject"];
                processedItem.teamName = item.fields["System.AreaPath"] || "默认团队";
                processedItem.collection = collection.name;
                const assignedTo = processedItem.assignedTo;

                if (!workloadData[assignedTo]) {
                  workloadData[assignedTo] = {
                    total: 0,
                    assigned: [],
                  };
                }

                workloadData[assignedTo].assigned.push(processedItem);
                workloadData[assignedTo].total++;
              });
            }
          } catch (err) {
            console.error(`Error loading work items from collection ${collection.name}:`, err);
            // 继续处理其他 collection
          }
        }

        // 对每个成员的工作项按延期状态排序
        Object.values(workloadData).forEach((memberData) => {
          memberData.assigned.sort((a, b) => {
            const priorityA = getDelayStatusPriority(a.delayStatus.status);
            const priorityB = getDelayStatusPriority(b.delayStatus.status);
            return priorityA - priorityB;
          });
        });

        console.log("Processed workload data:", workloadData);
        this.workloadData = workloadData;

        this.$nextTick(() => {
          this.updateChart();
        });
      } catch (err) {
        console.error("Load workload error:", err);
        this.error = `加载工作负载数据失败: ${err.message}`;
        this.workloadData = null;
      } finally {
        this.loading = false;
      }
    },
    updateChart() {
      const ctx = document.getElementById("workloadChart");

      if (this.chart) {
        this.chart.destroy();
      }

      // 使用过滤后的成员列表
      const members = this.filteredMembers;

      const datasets = [];

      // 统计每个状态的任务数
      const stateColors = {
        新建: "rgba(59, 130, 246, 0.5)", // 蓝色
        活动: "rgba(16, 185, 129, 0.5)", // 绿色
        已解决: "rgba(107, 114, 128, 0.5)", // 灰色
      };

      // 为每个状态创建一个数据集
      Object.keys(stateColors).forEach((state) => {
        const data = members.map((member) => {
          return this.workloadData[member].assigned.filter(
            (item) => item.state === state
          ).length;
        });

        datasets.push({
          label: state,
          data: data,
          backgroundColor: stateColors[state],
          borderColor: stateColors[state].replace("0.5", "1"),
          borderWidth: 1,
        });
      });

      this.chart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: members,
          datasets: datasets,
        },
        options: {
          responsive: true,
          scales: {
            x: {
              stacked: true,
            },
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: {
                stepSize: 1,
              },
            },
          },
          plugins: {
            tooltip: {
              mode: "index",
              intersect: false,
            },
            legend: {
              position: "top",
            },
          },
        },
      });
    },
  },
  mounted() {
    // 初始化时立即加载项目列表
    if (this.serverUrl && this.collections.length > 0) {
      this.loadProjects();
    }

    // 监听配置变化
    this.$watch(
      () => [this.serverUrl, this.collections],
      () => {
        if (this.serverUrl && this.collections.length > 0) {
          this.loadProjects();
        }
      }
    );
  },
});

app.mount("#app");

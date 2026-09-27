---
name: skill-creator
description: 创建新的技能(Skill)、修改和改进现有技能。当用户提到"创建技能"、"写个技能"、"做个助手"、"帮我做一个XX"、"我想让AI学会XX"、"把流程变成技能"时使用此技能，即使用户没有明确说出"技能"二字也应触发。也可用于编辑、优化已有技能。
---

# 技能创建助手

帮助用户创建和管理技能(Skill)，让 AI 能够更好地完成特定任务。

## 什么是技能？

技能是一组指导 AI 完成特定任务的指令集合，存储为一个目录：

```
skill-name/
├── SKILL.md          (必需 — YAML frontmatter + Markdown 指令)
├── scripts/          (可选 — 可执行脚本)
├── references/       (可选 — 按需读取的文档和规则)
└── assets/           (可选 — 输出使用的模板、图标等)
```

## 技能的三级加载机制

技能采用渐进式加载，避免撑爆上下文：

1. **元数据**（name + description）——始终在系统提示中，约 100 字
2. **SKILL.md 正文**——调用 `skill_lookup` 后加载（建议控制在 500 行以内）
3. **配套资源**（scripts/、references/、assets/）——AI 用 `file_read` 按需读取

配套资源**不会自动内联**。AI 只能看到文件列表（文件名），看不到内容。因此 SKILL.md 中必须明确写出每个资源文件的路径和使用时机，AI 才知道去读。

## 创建技能的流程

### Step 1: 了解用户需求

如果用户说"把这个流程变成技能"，先从对话历史中提取步骤、工具使用和修正点。

向用户了解以下信息：
1. 这个技能要帮 AI 完成什么任务？
2. 什么情况下应该触发？（用户会说什么话、提到什么关键词）
3. 期望的输出格式是什么？
4. 有没有特殊的规则或约束？

### Step 2: 规划技能结构

根据需求复杂度，决定内容分布：

- **SKILL.md** — 核心工作流程和指令（控制在 500 行以内）
- **scripts/** — 可执行脚本，用于确定性、重复性任务
- **references/** — AI 按需读取的规则、标准、领域资料
- **assets/** — 输出时使用的模板、图标等文件

**领域变体模式**：当技能支持多个领域时，按变体组织：
```
cloud-deploy/
├── SKILL.md          (工作流 + 领域选择)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```
AI 只需读取相关的 reference 文件，不用全部加载。

### Step 3: 编写 SKILL.md

基本结构：

```markdown
---
name: skill-name
description: 技能描述，说明何时使用。要覆盖触发场景和关键词，宁滥勿缺。
---

# 技能标题

说明这个技能做什么、为什么这样工作。

## 工作流程

### Step 1: [步骤名称]
[说明这一步做什么，解释为什么重要]

### Step 2: [步骤名称]
...

## 输出格式
[明确的输出模板]

## 重要规则
- [规则和原因]

## References
- **[references/xxx.md](references/xxx.md)** — 说明什么时候需要读这个文件
```

**编写要点：**

- **名称**：英文小写 + 连字符，如 `novel-reviewer`、`chapter-outliner`
- **描述要贪婪**：AI 容易不触发技能（欠触发），描述要主动覆盖相关场景和同义词。好例子：`当用户想要生成周报、写工作汇报、整理本周进度、总结项目进展时使用此技能，即使用户只说"帮我写个报告"也应触发。`
- **解释原因**：告诉 AI 为什么要这样做，比堆砌 MUST/ALWAYS/NEVER 更有效。比如"检查格式是因为下游系统会解析，格式错误会导致解析失败"，而不是"必须检查格式"
- **给示例**：示例比抽象描述更有帮助
- **用祈使句**：直接说"读取文件"、"输出结果"

**配套资源引用规范（重要）：**

在 SKILL.md 正文中，**必须明确写出每个配套文件的路径和使用时机**：
```markdown
审核时，读取 `references/审核规则.md` 检查输出是否符合标准。
需要批量转换时，执行 `scripts/helper.py`。
生成报告时，使用 `assets/report-template.html` 作为模板。
```

并在末尾加 **References 索引区块**：
```markdown
## References
- **[references/审核规则.md](references/审核规则.md)** — 输出审核标准，在生成最终内容前读取
- **[scripts/helper.py](scripts/helper.py)** — 批量格式转换脚本
```

配套文件较多时，简要说明每个文件的用途和读取时机。

### Step 4: 自我验证

写完技能后，在脑中模拟执行，逐项检查：

1. **触发检查**：选一个最典型的用户说法，技能描述能匹配上吗？
2. **流程完整性**：按技能步骤走一遍，输出符合预期吗？有没有遗漏的步骤？
3. **配套资源引用检查**：每个 references/ 和 scripts/ 下的文件，在 SKILL.md 正文中是否都写出了路径和使用时机？末尾有没有 References 索引？
4. **边缘场景**：选一个用户没明确提"技能"的场景，技能能触发吗？

发现问题先修正，再交给用户确认。

### Step 5: 保存技能

使用 question 工具询问用户是否确认保存，展示技能概要：
- 技能名称和描述
- SKILL.md 的核心流程
- 包含的配套文件列表

用户确认后，使用 **create_skill** 工具保存：

```
工具名: create_skill
参数:
{
  "name": "my-skill",
  "description": "技能描述，说明何时使用",
  "content": "完整的 SKILL.md 内容，包括 frontmatter (---) 和正文",
  "references": {
    "scripts/helper.py": "脚本文件的完整内容",
    "references/规则.md": "规则文件的完整内容",
    "assets/report-template.html": "输出模板的完整内容"
  }
}
```

**注意**：
- content 参数必须以 `---` 开头
- references 是可选的；键必须是相对于 Skill 根目录的完整路径（含 `scripts/`、`references/`、`assets/` 前缀）
- 兼容旧写法：裸文件名按扩展名自动分到 scripts/ 或 references/，新技能应显式写完整路径

## 修改现有技能

当用户要修改现有技能时：
1. 用 **skill_lookup** 读取当前技能的完整内容
2. 了解用户想改什么
3. 提出修改建议，用户确认后用 **update_skill** 更新

```
工具名: update_skill
参数:
{
  "skill_name": "my-skill（与 Available Skills 中显示的一致）",
  "content": "新的完整 SKILL.md 内容（包括 frontmatter 和正文）"
}
```

只更新某个配套文件：
```json
{
  "skill_name": "my-skill",
  "reference_name": "scripts/helper.py",
  "reference_content": "脚本的新内容"
}
```

内置技能修改时会自动克隆为用户副本。

## References

- **[references/templates.md](references/templates.md)** — SKILL.md 模板和示例，创建新技能时参考
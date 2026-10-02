# DeepCompose 修复台账（2026-10-02，B12 批次）

> 用法：修一条划一条。状态：⬜ 未修｜✅ 已修（含提交批次）｜🔶 部分修复/按裁决记录。
> 来源：`docs/AUDIT-2026-10-02-external.md`（40 条）+ 自查新发现（58 条）。

## 一、审计条目（I/A/B/C/D/E/F，40 条）

| 条目 | 状态 | 说明 |
|---|---|---|
| I-1 清单判据不一致（半可见作品） | ⬜ | |
| I-2 年代错误无 lint 机制 | ⬜ | |
| I-3 「待填写」不可结构化查询 | ⬜ | |
| I-4 伏笔自述数量无落点 | ⬜ | |
| I-5 isSystemEntryName 三条判定叠加 | ⬜ | |
| I-6 附加文档无登记 | ⬜ | |
| I-7 内容树 4 层静默截断 | ⬜ | |
| I-8 章节摘要模板占位与回写冲突 | ⬜ | |
| I-9 表格型内容无节可定位 | ⬜ | |
| I-10 skill-creator 教不存在的工具 | ⬜ | |
| I-11 KNOWN-LIMITS 定位矛盾 | ⬜ | |
| I-12 无导入动作/导入校验 | ⬜ | |
| A-1 审计脚本导航索引错位 | ⬜ | |
| A-2 tests/ 不做类型检查 | ⬜ | |
| A-3 ModelCombo 文档矛盾 | ⬜ | |
| A-4 _css_coverage 基线丢失 | ⬜ | |
| A-5 duplicate_detect 正则 /s | ⬜ | |
| A-6 cdp_probe 连不上真机 | ⬜ | |
| A-7 preview_shot 探已删选择器 | ⬜ | |
| A-8 builtin-skills 死资产 | ⬜ | |
| B-1 根外确认未接线 | ✅ | 批次1：guardWithConfirm + ToolContext.confirmExternal + controller 透传（UI 接线在批次3） |
| B-2 package.ps1 跳过 tsc | ⬜ | |
| B-3 会话列表/删除路径口径不同 | ⬜ | |
| B-4 冷读不跟会话级思考档位 | ✅ | 批次1：IsolatedSendOptions.thinking + providerOf 传档（UI 传参在批次3） |
| B-5 contextLimit/reservedOutputTokens 无上界 | ⬜ | |
| C-1 API Key 边输边发+落盘 | ⬜ | |
| C-2 SkillSection 绕过 dirty/save | ⬜ | |
| C-3 Row/GroupHead 组件体重定义 | ⬜ | |
| C-4 ThemeSection flash 死代码 | ⬜ | |
| C-5 Ctrl+S 无条件 preventDefault | ⬜ | |
| C-6 !boot 兜底分支不可达 | ⬜ | |
| D-1 useDialogFocus 无 focusin 兜底 | ⬜ | |
| D-2 MainWorkbench 状态归属三件套 | ⬜ | |
| D-3 冗余/缺能力三件套 | ⬜ | |
| E-1 KeepCompose 残留五处 | ⬜ | |
| E-2 魔数三处各写一遍 | ⬜ | |
| E-3 审计脚本闸门语义不统一 | ⬜ | |
| E-4 工具文档覆盖缺口 | ⬜ | |
| F-1 B10/B11 未提交 | ✅ | 基线提交 603ef18（修复全程分批提交） |
| F-2 同 I-11 | ⬜ | |

## 二、自查新发现（N-01 ~ N-58）

### 高危

| 条目 | 状态 | 说明 |
|---|---|---|
| N-01 replace 按原字节匹配 CRLF 必炸 | ✅ | 批次1：EOL 容错匹配 + 替换文本归一主导 EOL（含回归测试） |
| N-02 压缩缓存短路检查点不前进 | ✅ | 批次1：命中先验尾巴预算，超限以旧检查点+尾巴为源重压（含回归测试） |
| N-03 断流丢部分正文 | ✅ | 批次1：streamError 路径保留部分消息入库 |
| N-04 moveToRecycle 先改名后写清单 | ⬜ | |
| N-05 进设置页卸载丢稿/丢生成态 | ⬜ | |
| N-06 saveTabAs 返回值被忽略 | ⬜ | |
| N-07 e2e 覆写真实配置无备份 | ⬜ | |
| N-08 fs_copy 无自复制/junction 防护 | ⬜ | |
| N-09 prefs_load 吞错返回 {} | ⬜ | |
| N-10 BOM 未剥离 | ⬜ | |
| N-11 fs_read_text 硬 UTF-8 | ⬜ | |
| N-12 search 单文件拖垮+无深度上限 | ✅ | 批次1：逐文件/目录容错 + files_skipped + 深度上限 16（含回归测试） |
| N-13 insert/delete_lines 静默归一 EOL | ✅ | 批次1：行级字节保持（splitLines/joinLines）（含回归测试） |
| N-14 Anthropic 输入统计偏低 | ✅ | 批次1：inputTokens 计入缓存读写；测试锁同步更新 |
| N-15 reasoningReplay 死线 | ✅ | 批次1：按 D-012 裁决（一律不回传）矫正注释，非实现回传 |
| N-16 脚本强杀所有 deepcompose 进程 | ⬜ | |

### 中危

| 条目 | 状态 | 说明 |
|---|---|---|
| N-17 模态叠层 Esc 关两层 | ⬜ | |
| N-18 Dialogs Esc 无 isComposing 守卫 | ⬜ | |
| N-19 MemoModal 挂边态 Tab 陷阱 | ⬜ | |
| N-20 数字输入当场 clamp 吞小数点 | ⬜ | |
| N-21 UsagePanel 节流被卸载架空 | ⬜ | |
| N-22 设置卸载保存与 booted 竞态 | ⬜ | |
| N-23 向导创建中可 Esc/遮罩取消 | ⬜ | |
| N-24 连接检测竞态覆盖手选模型 | ⬜ | |
| N-25 平台提示弹窗无焦点接管 | ⬜ | |
| N-26 purgeItem 目标缺失中断清空 | ⬜ | |
| N-27 thinkingSupportedFor 严格相等 | ✅ | 批次1：sameBaseUrl 忽略尾随斜杠/大小写 |
| N-28 onboarding 子串匹配+{书名}二次替换 | ⬜ | |
| N-29 parseIndex 不校验字段 | ⬜ | |
| N-30 profileFromPrefs 丢思考字段 | ✅ | 批次1：继承当前同地址档位的 thinking/reasoningEffort/supportsThinking |
| N-31 parseFrontmatter 闭合围栏误匹配 | ⬜ | |
| N-32 ai_stream 失败泄漏 AbortMap | ⬜ | |
| N-33 CSP null 信任边界为空 | ⬜ | |
| N-34 token-optimizer 退出码矛盾 | ⬜ | |
| N-35 token_audit 自检段必崩 | ⬜ | |
| N-36 preview_diag 异常当就绪 | ⬜ | |
| N-37 energy/cache/SKILL 阈值打架 | ⬜ | |
| N-38 技能大小标签三处不一致 | ⬜ | |
| N-39 ds_probe 默认模型名不存在 | ⬜ | |

### 低危

| 条目 | 状态 | 说明 |
|---|---|---|
| N-40 叠层双 Tab 陷阱依赖注册顺序 | ⬜ | |
| N-41 closeTab updater 副作用 | ⬜ | |
| N-42 工具失败判定子串误标 | ⬜ | |
| N-43 无 mtime 显示 1月1日 | ⬜ | |
| N-44 openSession 静默吞错 | ⬜ | |
| N-45 CSS 死规则+长作品名撑破 | ⬜ | |
| N-46 dirs.relative 不归一 / | ⬜ | |
| N-47 ai.rs 错误体无界+锁 unwrap | ⬜ | |
| N-48 winstate 溢出+panic=abort | ⬜ | |
| N-49 fs_list/fs_stat 链接语义不一 | ⬜ | |
| N-50 产品身份三代同堂 | ⬜ | |
| N-51 _style_audit 未知 flow KeyError | ⬜ | |
| N-52 sys.rs 路径回退假设 | ⬜ | |
| N-53 e2e BOM 剥离 3..2 越界 | ⬜ | |
| N-54 uiwalk 失败漏杀进程+裸文件名崩 | ⬜ | |
| N-55 capture.ps1 无 ErrorActionPreference | ⬜ | |
| N-56 token-optimizer 裸 except | ⬜ | |
| N-57 SKILL.md 引用不存在技能 | ⬜ | |
| N-58 saveSession 索引失败留孤儿 | ⬜ | |

---
**提交记录**：`603ef18` 基线保护 → `16c9a79` 批次1（tools/AI 核心：N-01/02/03/12/13/14/15/27/30 + B-1/B-4 核心侧）

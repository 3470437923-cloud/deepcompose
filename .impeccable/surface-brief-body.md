# writerD — 主工作台重做（surface brief）

- MODE: **Operate**（用户处于任务中：写作、审稿、采用。表达不得遮蔽任务、状态与既有可供性。）
- SCOPE: `src/ui/MainWorkbench.tsx`（主工作台）+ `src/screens/SettingsScreen.tsx`（设置 7 分页）
  + 全局材质层。两个屏幕共用一个外壳，属于同一 surface。
- TARGETS: 主工作台、设置屏、备忘录、三个模态、状态条。
- 绑定约束（用户指令，不可协商）：无玻璃材质、无渐变材质；清爽简约、高级感；三套主题
  （`dark`/`light`/`dsblue`）必须保留；三栏布局与左栏三个内容分类必须保留。

## Audience / job / constraints

单人长篇中文小说作者，Windows 桌面，连续数小时驻留。任务是**把长篇持续推进下去，且作者的意志不被
AI 覆盖**。约束见 `PRODUCT.md`「Capabilities and Constraints」：磁盘格式契约、封闭配置键集合、
零 UI 运行时依赖、四个取证工具链必须继续可用。

## Chosen direction

**「付印单」——把工作台做成一张印刷厂的校样流转签。**

概念种子的 CONSIDER 产出 `seed key e4dd21f6`，`--scope direction --mode operate`，指派 **自选接地列表第 4 位**。
自选七项按共鸣度排序（材料族至少三类）：

1. 校样 + 校对符号（GB/T 14706）——编辑批注材料族。最高共鸣：候选稿 + 作者手改 + 付印，
   就是 writerD 的"候选 → 采用门"。
2. 版框 / 界行 / 鱼尾（古典书页架构）——书页架构族。发丝线就是全部网格，天然扁平无渐变。
3. 稿纸方格（20×20）——纸品文具族。字数即格数。
4. **印厂校样流转签（稿签）**——印刷工单族。**← 建这一项**
5. 铅字字盘——印刷工单族。格仓承载文件树与会话列表。
6. 排版尺（pica 尺）——量具族。刻度轨承载字数与进度。
7. 图书馆目录卡——档案族。横格卡承载 14 件套维护文档。

### Challenger verdicts（先定裁决，再谈借鉴）

| challenger | 裁决 | 依据 |
|---|---|---|
| design-annual-s-plate-section | **competitive** | 产品清晰度轴赢（发丝线即网格、小号等宽标签、0 圆角矩形、状态反转底色）；受众认同轴输（中文小说作者不认识设计年鉴） |
| kraftwerk-man-machine | **declined** | 两轴皆输；且霓虹发光与"无渐变无玻璃"绑定约束直接冲突 |
| operate-c-emission-line-rail | **competitive** | 产品清晰度轴强赢（**状态由线形承载而非色相**：实线=正式、虚线=候选、半高=陈旧、划掉=禁用）；受众认同轴输 |
| scientific-notation-oscilloscope-signal-bench | **declined** | 受众认同轴输；磷光绿 + 发光违背绑定约束 |
| rivers-tides-ocean-depths-mesophotic-deep-dive | **declined** | 受众认同轴输；垂直深度轴与三栏横向结构冲突 |
| kinetic-sculpture-automata-tensegrity-breathing-column | **declined** | 受众认同轴输；"松弛状态"观念可借，其余为服装 |

### Raises（被否决的 challenger 各自让出的一门纪律，写进本方向）

- **raise from kraftwerk-man-machine — 电流沿连接线行进。** 阶段推进时，连接两阶段的那段发丝线由
  实心强调色自左向右填满（`transform: scaleX`，纯 transform，**无发光、无渐变**），随后新印章以一次
  spring 过冲落位。这是本 surface 唯一被编排的动效时刻（签名交互「过签」）。
- **raise from operate-c-emission-line-rail — 状态用线形，不用色相。** 正文/候选/已处理/废弃的区分
  落在线的形态上（实线 / 虚线 / 半高 / 划线），色相只留给"当前"与主操作。
- **raise from scientific-notation-oscilloscope-signal-bench — 被测量的刻度。** 字数不再是一个孤立的
  数字，而是靠在一根带刻度的量尺上读数（状态条成为刻度轨）。
- **raise from rivers-tides-ocean-depths-mesophotic-deep-dive — 一条轴统辖所有正文。** 三栏共用同一条
  发丝基线寄存器，面板不再各自浮动（落在一个共同 rail 上）。
- **raise from kinetic-sculpture-automata-tensegrity-breathing-column — 松弛可读。** 不可用/空条目读作
  "松弛"（发丝线变淡、无填充），而不是读作一个禁用的按钮。

## 断然拒绝的类别默认（rut）

本类别必发货的两种样子，都不得出现：
① 环境光壁纸 + 毛玻璃面板 + AI 面板发光（**旧世界，本次的反面参照**）；
② 暖米黄纸感 + 衬线体 + 印泥红（"中国写作软件"的默认皮肤，`craft-floor` 与 `new-work` 双重点名）。

---

## Direction contract

THESIS
工作台是一张印刷厂的校样流转签：每个区域由 1px 发丝线登记定位，当前章节的管线阶段是全屏唯一被允许
携带强调色墨水的东西。拒绝的类别默认：环境光玻璃桌面（旧世界）与其反面暖米黄纸感皮肤。

OWN-WORLD
冷调非涂布表单纸（**永不暖米黄**）、近黑墨色（**永不为纯黑 #000**）、五级实色色阶
（画布 → 侧轨 → 纸面 → 抬升 → 井）、1px 发丝线构成全部网格、收敛到 4/6/8px 的紧半径几何
（印章与登记标 2px、控件 4px、卡片 6px、面板 8px；仅开关轨道与滑杆钮为真圆）、
单一强调墨只出现在"当前"与主操作。零 `backdrop-filter`、零渐变、零发光晕。

STORY
作者一进界面就知道三件事：手上这一章走到哪一步、AI 动过什么、哪一份才是正式正文。
他不需要理解"AI 在思考"，只需要看见"这一阶段已过签"。

FIRST VIEWPORT
无 hero、无壁纸，整屏就是那张表单。顶部 50px 表单抬头：左为作品与章节名（墨色最重一级），
右为工具簇与窗口控制。其下三栏按同一条发丝基线寄存器对齐：左右侧轨取深一档色阶、中栏编辑器取
最浅"纸面"色阶，栏间由 1px 竖线分隔而非间距留白。中部 tabstrip 是表单的页签切口（当前页签以
底部 2px 强调墨实线标记，不用填充块）。底部 32px 状态条改为**阶段轨**：章节管线阶段以等距刻线
排列，当前阶段为实心强调墨短柱、已过为实线、未到为发丝线，右侧接刻度量尺（字数读数）。
主操作（发送 / 采用为正文）位于其所在区域的右下角，是屏上唯一实心强调色块。

FORM
自选接地列表第 4 位「印厂校样流转签」；seed key `e4dd21f6`；编排动效为签名交互「过签」。
执行路径 **code-led**（本机无图像生成能力，按 `new-work.md` 无图像生成时唯一路径）。

FINISH
unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## 未决事项

- 阶段轨是否需要同时保留现有自由状态文案（`N 章 · N 待确认 · N 份资料`）——本轮做法：保留，
  刻度轨在其右侧。
- 自定义滚动条：按 `craft-floor`「主题化浏览器表面」保留但压到最细，不再用磨砂观感。
  （`operate.md` 把"自定义滚动条"列为约束项，故取最小干预：仅设宽度与色，不改变滚动行为。）
- 旧 `glass.css` 的类名（`.glass` / `.glass-bar` / `.glass-pop` / `.glass-inset` / `.glint` /
  `.grain` / `.ambient` / `.orb`）在本方向中语义已不存在，将改名为 `.surface*` / `.rail` 等实色词汇。
  这是内部类名，**不属于磁盘格式契约**，改名安全。
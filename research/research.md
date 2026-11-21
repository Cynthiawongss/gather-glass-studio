# Gather｜调研记录

访问日期：2026-11-20。标注含义：【已开】实际打开并读到正文；【摘要】只看到搜索摘要；【失败】没读到。
所有竞品都只读了页面文字，没有试玩。所有 skill 都只读了规则原文，没有安装。

## 1. 能让 Claude 把设计和产品做得更好的免费开源项目

星数、许可证来自当天 GitHub API。

| 排名 | 项目 | 是什么 | 许可 / 星数 | 这次怎么用上的 |
|---|---|---|---|---|
| 1 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | skill + 24 个命令（critique、audit、polish…） | Apache-2.0 / 约 114k | 用它的 critique 量表（Nielsen 10 项 0–4 分 + 认知负荷 8 项）做了锐评；对比度、阴影、间距、文案规则直接照做 |
| 2 | [anthropics/skills · frontend-design](https://github.com/anthropics/skills) | 官方 skill | Apache-2.0 / 约 198k | "视觉选择从题材的材料和行话里来"；先定 token 再写代码；大胆只花在一处 |
| 3 | [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) | 13 个 three.js skill | MIT / 约 4.3k | 玻璃材质配方、透射只折射不透明物体、像素比封顶 |
| 4 | [emilkowalski/skills](https://github.com/emilkowalski/skills) | 动效与手势 skill | MIT / 约 58k | 缓动曲线、按压 scale(0.97)、时长区间、拖动期间 1:1 跟手 |
| 5 | [vercel-labs/agent-skills · web-design-guidelines](https://github.com/vercel-labs/agent-skills) | 审查型 skill | 仓库未标许可 / 约 35k | 焦点环、reduced-motion、overscroll-behavior、hover 设备门控 |
| 6 | [kyh/vibedgames · game-feel](https://github.com/kyh/vibedgames) | 游戏手感 skill | MIT / 62 | 100ms 内响应、物理乘 dt、效果绑定"真的发生了"的事件 |
| 7 | [phuryn/pm-skills](https://github.com/phuryn/pm-skills) | 72 个 PM skill | MIT / 约 28k | 8 类风险、Pre-mortem（Tiger / Paper Tiger / Elephant）用在产品锐评 |
| 8 | [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) | three.js 游戏 skill | MIT / 约 2.9k | 手感优先级：输入响应 → 响应曲线 → 接触反馈 → 声画同帧 |

对这个项目直接有用的开源代码（不是 skill）：

- [visual3mad/claywheel](https://github.com/visual3mad/claywheel)（MIT）：陶轮模拟。高斯笔刷 `r[i] += amount·exp(-0.5d²)`、与事件频率无关的平滑、体积守恒公式。本版的拉/收笔刷就是这个思路。
- [pmndrs/drei-vanilla](https://github.com/pmndrs/drei-vanilla)（MIT）：MeshTransmissionMaterial 的非 React 版，带色散和背面渲染。本版没用，留作画质升级路线。
- [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing)（Zlib）：bloom 等后期。本版没用。
- [Poly Haven](https://polyhaven.com/license)（CC0）：免费 HDRI。本版用 three.js 自带的 RoomEnvironment，零下载。
- [KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX)（MIT）：极小的程序化音效库。本版自己用 Web Audio 写了三种声音。
- 玻璃"叮"的泛音来自 ChucK 官方示例实测值 1206 / 2240 / 3919 / 5965 Hz（[Listing 7.10](https://chuck.cs.princeton.edu/doc/examples/book/digital-artists/chapter7/Listing7.10.ck)）。

不推荐或有条件：21st.dev Magic MCP（需要 key，部分付费）；Figma MCP（免费席位每月 6 次调用）；deanpeters/Product-Manager-Skills（禁止商用）；Leonxlnx/taste-skill（MIT，约 119k，但针对公司官网，不适合 3D 玩具）；nextlevelbuilder/ui-ux-pro-max-skill（MIT，约 152k，是配色/字体检索库，品牌功能付费）。

关于 Claude Design：没有用。它适合出静态画布稿和设计系统，而这个产品好不好看取决于实时渲染的玻璃和拖动手感，静态稿验证不了。等要做落地页、分享卡片、品牌规范时再用。

## 2. 工艺

- 三种工艺的区别【已开】[UrbanGlass 术语表](https://urbanglass.org/classes/glossary-of-terms)：吹制是对吹管端的一团料（gather）吹气；热塑是用工具塑实心热玻璃；灯工是在喷灯上软化预制的棒和管。frit 是碎玻璃色料。
- 吹制流程【已开】[Museum of Glass](https://museumofglass.org/our-studio)：熔炉约 1150°C，吹管蘸料 → 边做边反复回加热室 → 敲下 → 进退火炉缓冷。
- 工具【已开】[Iowa State Gaffer's Guild](https://gaffer.stuorg.iastate.edu/tools/)：blowpipe、punty、marver、jacks（压出颈线，便于敲断）。
- 加热室（glory hole）约 1260°C【已开】[MIT Glass Lab](https://web.mit.edu/GLASSLAB/andrea/gwebBIG4.htm)。
- 退火保温约 482°C【摘要】Bullseye 技术手册。玻璃刚开始可见发光约 525°C【已开，维基】[Draper point](https://en.wikipedia.org/wiki/Draper_point)。
- 目视色温【已开，维基】[Red heat](https://en.wikipedia.org/wiki/Red_heat)：暗红 705–814°C，橙 982–1092°C，黄 1093–1258°C。
- 康宁玻璃博物馆的三个页面（glass-flower、flameworking-demo、moon-ornament）【失败】：被验证码挡住。交接包里引用它们的结论这次没能复核。

转成网页动作的 5 步：蘸料选色 → 回炉加热 → 吹气 → 用工具拉鼓/收腰/抻长 → 敲下退火。省略了：滚料板、转移到 punty、开口、冷加工。退火从几小时压缩成两秒。

## 3. 竞品

| 项目 | 状态 | 玩法 | 保存 | 收费 |
|---|---|---|---|---|
| [PUFF](https://sweetai-tools.itch.io/puff-prototype)【已开】 | 在线，原型 | 空格吹、Shift 转管、H 回炉、Enter 评分；不转会下垂，过吹会爆 | 未提 | 免费 |
| [Glassworks](https://glassworks-mauve.vercel.app/)【已开】 | 在线，alpha | 12 种工具，逐环模拟壁厚/热量/下垂，体积守恒；有订单和玩家市场 | 未写 | 未见 |
| [Glass Blown](https://hedrosgames.itch.io/glass-blown)【已开】 | 在线 | 空格吹、方向键转，按订单匹配器形 | 未提 | 免费 |
| [Pottery Studio](https://dinogame.gg/games/pottery-game/)【已开】 | 在线 | 拖拽拉坯，太湿太薄会塌 | 浏览器本地，最多 12 件 | 免费 |
| [Prism Beam](https://etc.cmu.edu/our-work/projects/finder/prism-beam)【已开】 | CMU 2023 学生 VR 项目 | 未写 | 未写 | 不适用 |

结论（设计判断）：直接竞品都在往"模拟器/经营游戏"走（评分、订单、12 种工具）。没人做"好看到想截图、做完想留着"的那一种。Gather 的差异点放在审美和成品，不放在物理真实度。

## 4. 技术

- three.js 当前版本 r187（2026-10-30 发布）【已开】[releases](https://github.com/mrdoob/three.js/releases)。本机没有 Node，所以用无构建方案：ES 模块 + importmap，版本钉死在 0.187.0。
- 透射【已开】[MeshPhysicalMaterial 文档](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) 和 r187 源码：有透射物体时不透明物体多画一遍；透明物体隔着玻璃看不见（所以背景用不透明着色器混合两张图，而不是两层半透明）；DoubleSide 的透射物体会把背面也画进去，空心器皿因此能看到后壁。
- 形状：一条 40 点的半径剖面绕轴旋转。顶点原地改写，不每帧新建几何体。
- 输入【已开】MDN：`setPointerCapture`、`pointercancel`、`touch-action: none`；触控板捏合在 Chrome 里是 `ctrlKey=true` 的 wheel 事件，要 `{passive:false}` 才能拦截。Safari 的捏合走专有的 GestureEvent，本版没接。
- 存储【已开】[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)：localStorage 每源约 5 MiB，超限抛 QuotaExceededError；Safari 在 7 天无交互后可能清除脚本写入的数据。

## 5. 首版决定

- 造型：一只吹出来的小瓶（不是花）。理由：用户的钩子词是"吹"；实心花靠拉网格，网页上又难看又难控；剖面旋转体能保证怎么拉都好看。
- AI：首版没有任何模型调用，名字里也去掉了 AI。没有一个 AI 功能是这条核心体验需要的。
- 额度：按"首次保存成功"计 1 件，同一件重复保存不计，删除不退，第 4 件在开始前拦截。只存在本地浏览器，是演示，不是可靠的收费约束。
- 暂缓：账户、真实支付、付费材质/造型、分享链接、手机适配、Safari 捏合、bloom 后期。

## 6. 灯工（第二种玩法的调研，2026-11-20 追加）

YouTube 和小红书/抖音的内容这次都读不到，下面只来自能打开的文字页面。

**玻璃圣诞树的真实做法（体验课主流款是"缠丝树"）**

- 【已开】[伦敦 SONG Art & Craft 体验课记录](https://iamapolarbear.com/2025/12/11/lampworking-making-a-christmas-tree-using-a-blowtorch/)：一手拿"树棒"（一根玻璃棒，最后就是树干），另一手把料棒伸进火里烧熔；熔玻璃碰到树棒粘住，稍微拉开成细丝，转动树棒把丝缠上去。成品是几百根玻璃丝，像棉花糖。先用透明料再加深绿。整棵过火后在石墨板上滚，把乱丝压顺。星星是烧一个球再用钳子捏出五个角。红点点上去。课程约 2.5 小时。
- 【已开】[崇真艺客](https://www.trueart.com/news/737380.html)："一手转动玻璃棒，把烧软的玻璃边拉成丝边绕进去"；绕到一半换色做双色树；装饰是把彩色棒烧亮后在树上戳。
- 新手常见失败：转得慢丝会乱翘，顶部缠太粗，星星捏歪。
- "逐层点枝""拉锥剪枝"两种做法没找到可读的教程，未验证。

**玻璃花**

- 【已开】[缠绕式花](https://artjewelryelements.blogspot.com/2016/04/free-lampwork-tutorial-plant-poke.html?m=1)：绕一个小球，压平，像做碟子一样一圈圈往外绕，再用小钳子一口一口咬出花瓣。
- 【已开】[点花珠](https://harrachglass.blogspot.com/search/label/petals)：绕一颗底珠，围一圈点 3–5 个色点，一层层叠，第二圈点在花瓣缝上。
- 【已开】[压叶钳做叶子](https://harrachglass.blogspot.com/search/label/lampwork)：料球夹扁，粘一根细丝把尖端拉尖。

**和吹制的区别**【已开】[入门指南](https://justbeginning.pages.dev/lampworking/start)、[维基](https://en.wikipedia.org/wiki/Lampworking)：热源是喷灯不是熔炉；材料是实心的棒；核心动作是烧球、粘、拉丝、缠、点、捏、烧断；不停地转是为了让重力把玻璃拉圆。

**数字先例**

- Glassworks 自称灯工工作室，但页面写的是吹硼硅管，12 种工具里没有芯棒、绕珠、缠丝。也就是说"缠丝树"这种玩法目前没有找到任何网页先例。
- three.js 官方示例模块 [TubePainter](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/misc/TubePainter.js)：沿用户移动路径实时长出管子，预分配顶点、只改写新增部分。和本项目 `src/coil.js` 的做法一致。
- 透射材质看不到背后的其他透射物体，所以几百根丝不会互相折射，要靠环境反射和吸收色表现。

**隔离实验**：`lab/coil.html` 用一根玻璃条沿螺旋路径铺成一棵树，渲染成立。这只验证了画面，没有验证手感。

## 7. 信息收集工具（2026-11-20 追加）

通用搜索读不到视频和中文平台，所以装了 [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach)（MIT，约 11.4 万星，v1.6.1）。它是一个命令行工具，让 AI 搜索和读取 YouTube、B 站、GitHub、V2EX、网页；小红书、Reddit 等需要登录的渠道没有开。安装方式是先装 uv，再从它的 GitHub Releases 安装（PyPI 上同名的包不是它）。

对比过的其他项目：crawl4ai（约 8.8 万星，网页抓取）、Scrapling（约 10.5 万星，爬虫框架）、gpt-researcher（约 3.1 万星，要自己配模型 Key）、yt-dlp（约 20.9 万星，Agent-Reach 内部已经用它）。选 Agent-Reach 是因为它覆盖的正好是之前读不到的视频和中文平台，而且不用任何 Key。

用它找到的关键参考：B 站「用玻璃做一棵拔丝圣诞树」（璃所当燃，约 20 万播放，54 秒，BV16M411X7Ze）。视频没有文字，是在浏览器里逐帧看的：

- 先用透明玻璃条搭一个锥形骨架（几根棱从顶点连到底部的星形底圈）。
- 转着骨架，把烧软的料拉成丝缠上去，缠到完全盖满锥面。
- 成品看上去是一整块通透的翠绿（或淡紫）玻璃，表面是一圈圈丝的纹理，轮廓是一层层参差的小尖，丝尾挂着透明小水滴。
- 星星是单独烧的一颗奶黄色胖星星，小珠是不透明的橙、蓝、白。

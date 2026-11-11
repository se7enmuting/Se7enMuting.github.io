---
layout: post
title: "Outlook 搜不到邮件，我最后改了 HTML 里的哪几行"
subtitle: "从 64,706 个字符里缩小改动范围：XML 条件块、VML 行为，以及一次邮件搜索排障留下的可复用方法"
author: "Se7enMuting"
date: "2026-11-08"
last_modified_at: "2026-11-12"
header-img: "img/posts/261108/post-bg.jpg"
header-mask: 0.4
permalink: /2026/11/08/Outlook_PST_XML_VML_Search/
tags:
  - 技术
  - Outlook
  - Windows
  - 故障排查
  - 自动化
---

那封一直搜不到的邮件，终于出现在结果里了。打开一看，行距却变大了，原来紧凑的段落之间多出不少空白。

邮件里存着技术往来、现场截图和处理记录。搜索恢复了，原来的排版也得留下。

后来保留下来的是整封邮件的头部、普通样式和正文，处理范围缩到了两处：**Word 的特定 XML 条件块，以及样式中的 `behavior:url(#default#VML)` 声明。** 那封样本从 64,706 个字符变成 64,301 个字符，减少 405 个字符，进入了索引，之前的行距问题也在复查中消失了。

这篇就从这 405 个字符说起：改了哪里、哪些地方必须保留，以及怎样拿一封自己的邮件做对照。完整代码、批次数字和迁移细节放在文末备忘，方便以后查。

> 实验发生在 2026 年 11 月 3 日至 8 日，环境是 **Windows 经典版 Outlook + 本地 PST**。业务名称、人员、单号及私人路径已匿名化。这是一组样本的兼容处理记录，适用效果需要在自己的邮件上验证。

可以直接跳到[XML/VML 的具体改动](#xml-vml)、[单封复现流程](#reproduce)或[最终的日常搜索设置](#daily-search)。

## 先确认：邮件在，搜索结果里没有

最初是搜一个工单号。网页版能找到一串来往邮件，本地只找到几封。退出搜索，按日期翻到 10 月 30 日，漏掉的那封就在列表里，标题也包含那个单号。

在线邮箱只有约 1 GB，需要定期清理；长期资料靠规则复制到本地。主 PST 当时约 24.6 GB，收件箱约 2.45 万封。重建索引、调整范围、高级查找、分文件夹、拆成独立 PST，都试过，那封邮件还是没有稳定地回来。

换成 Outlook 对象模型，从实际文件夹按日期枚举邮件、直接比较 `Subject`，却能列出同一工单的 14 封往来。随后与 `SystemIndex` 对账，也发现了缺口。

这个核验要绕开全文索引查询：直接读对象属性，在程序里比较字符串。否则换了 API，可能仍在问同一个索引。确认邮件实体存在后，我留下原件，只拿副本做实验。

## 改成纯文本能搜到了，代价是原来的格式

同一封邮件做了几种副本：

| 副本处理 | 当次观察 |
| --- | --- |
| 原样复制，保留原 HTML | 观察窗口内未查到目标索引记录 |
| 保留 HTML，移除附件 | 仍未查到 |
| 改为纯文本 | 约 3.6 秒后查到 |
| 重写为较简单的 HTML | 约 4 秒后查到 |

附件移除后没有改善，改正文表示却有变化，于是继续拆细：只删 XML、删条件注释、重新包装 `<head>`、仅保留 `<body>`。

只留正文的副本能入库，但行距变了。只删 XML 的方案，在两次短时观察里结果也不一致。Windows Search 异步处理，表中的几秒只是记录，后续复现还需要留足观察时间和不改正文的对照件。

### 行距为什么变了

一封 Word 生成的邮件，正文可能是：

```html
<p class="MsoNormal">第一段技术说明</p>
<p class="MsoNormal">第二段技术说明</p>
```

让这两段保持原来间距的样式，却在 `<head>` 中：

```css
p.MsoNormal {
    margin: 0cm;
    margin-bottom: .0001pt;
}
```

把头部整段扔掉，正文两个 `<p>` 一个没少，显示照样会变。字体、表格边框、单元格间距、签名样式也是同样的道理。有的测试件还出现了“在 Web 浏览器中查看”的提示。

所以我把原来的 `<head>`、普通样式、生成器信息和正文结构都留了下来，再从里面挑出候选片段。

Outlook 使用 Word 处理邮件 HTML；微软记录过编辑、发送时修改 `HTMLBody` 导致格式变化的情况。这里同样需要在保存后检查实际显示。[微软说明：编辑 HTMLBody 时的格式丢失](https://learn.microsoft.com/en-us/troubleshoot/outlook/user-interface/formatting-lost-when-editing-the-htmlbody-property)。

<a id="xml-vml"></a>

## 核心改动：保留原来的 head，只处理选中的 XML 块和 VML 声明

把范围写成一张表，就很清楚了：

| 位置 | 处理对象 | 留下什么 |
| --- | --- | --- |
| Word 条件注释 | 完整识别选定的 XML 数据块及其条件外壳 | 非 XML 的条件内容，例如表格 |
| `<style>` | 已确认的 `behavior:url(#default#VML)` 声明 | 同一块里的其他 CSS、注释和字符串 |
| 其余邮件内容 | 原样保留 | 头部、正文、表格、图片引用、附件和主题 |

下面两段代码，就是这次处理要找的位置。

### 第一类：条件注释包着的 Word XML 数据块

样本中有这样的内容，以下保留技术结构，省去业务正文：

```html
<!--[if gte mso 9]><xml>
 <o:shapedefaults v:ext="edit" spidmax="1026" />
</xml><![endif]-->

<!--[if gte mso 9]><xml>
 <o:shapelayout v:ext="edit">
  <o:idmap v:ext="edit" data="1" />
 </o:shapelayout>
</xml><![endif]-->
```

可以从外往里读：

| 部分 | 这里表达的内容 |
| --- | --- |
| `if gte mso 9` | 面向特定 Office 版本的条件分支；它本身不是错误标记 |
| `<xml>…</xml>` | 分支中的 XML 数据块 |
| `o:shapedefaults` | Office 图形的默认设置信息 |
| `o:shapelayout`、`o:idmap` | 图形布局及标识映射信息 |

Office 会按条件处理这些内容。外面包着注释，并不表示它对邮件显示一定没有作用。

在这批样本的兼容实验中，处理对象收敛到了这些 XML 块。操作单位是**完整的条件块**，连同对应的结束标记一起处理，避免只删一半留下残片。

要特别分清另一个长得很像的例子：

```html
<!--[if gte mso 9]>
<table><tr><td>给 Outlook 准备的排版内容</td></tr></table>
<![endif]-->
```

这个分支要保留：它装着实际排版表格。匹配规则需要看清条件块内部，不能只查到 `mso 9` 就整段删除。

### 第二类：样式中的 VML 行为声明

另一处候选是：

```html
<!--[if !mso]><style>
v\:* { behavior:url(#default#VML); display:inline-block; }
</style><![endif]-->
```

VML 是微软早期的矢量图形格式，`behavior:url(#default#VML)` 用于关联它的行为。微软的 VML 文档就使用了这类样式写法。[VML 结构与行为声明](https://learn.microsoft.com/en-us/windows/win32/vml/web-workshop---specs---standards----introduction-to-vector-markup-language--vml-)。

处理这个声明时，同一 `<style>` 中的其他属性要留下。否则又会回到行距走样的问题：

```diff
 <style>
-v\:* { behavior:url(#default#VML); display:inline-block; }
+v\:* { display:inline-block; }
 p.MsoNormal { margin:0cm; margin-bottom:.0001pt; }
 </style>
```

`<v:shape>`、VML 背景和对应的图片回退先保留。遇到实际依赖 VML 显示图形的邮件，需要单独做显示对照，不能直接套用这条处理。

### 少了 405 个字符之后

最终重做 20 封样本时，采用的方向是：保留原来的头部、普通 CSS、正文、表格和图片引用，处理选定的 XML 与行为声明，放弃整封 HTML 重建。

两封样本的记录很直观：

| 样本 | 原 HTML 字符数 | 处理后字符数 | 减少 |
| --- | ---: | ---: | ---: |
| 最初遗漏的技术往来邮件 | 64,706 | 64,301 | 405 |
| 另一封图文周报 | 59,363 | 59,145 | 218 |

这里是程序记录的字符串长度，不是 PST 占用空间，也不是附件减少了多少字节。

`rerepair_20.log` 记录了随后 **20/20 样本在 SystemIndex 中查到记录**。复查阅读窗格后，没有再看到之前的行距差异，才继续扩大处理。

其中有 4 封 HTML 没有变化，也进入了索引。早期检查过正文属性、结尾 NUL、重复保存和变更通知，后面也确实遇到了重新保存就补录的邮件。因此，**这组结果验证了样本处理流程，还没有把 XML、VML 和保存通知各自的影响完全分离。**

为了便于复用，本文示例又收窄了一次规则。三个阶段要分开：

| 代码阶段 | 实际范围 |
| --- | --- |
| 得到上述样本结果的实验脚本 | 仍包含独立 XML、整段 VML 兼容样式、其他 `behavior:url(...)` 的处理；无样式时还会尝试补段落样式 |
| 后来的批量原型 | 扩大到全部匹配的 `gte mso 9`、`!mso` 条件块，产生了新的误报问题 |
| 本文离线示例 | 只处理下面列明的两种 XML 结构，以及样式中的特定 VML 声明；其他内容保留 |

405 是历史样本的改动量，不是下面示例应当删掉的固定字符数。

<a id="reproduce"></a>

## 用一封自己的邮件复现

整条操作路径是：**保存原件 → 建对照件和实验件 → 导出 `HTMLBody` → 离线预览 → 只写回实验件 → 对比显示与搜索。**

需要 Windows 经典版 Outlook、Windows PowerShell 5.1（`powershell.exe`）和 Python 3。示例只用标准库，不需要安装 Python 包。三个脚本的完整代码放在[文末复现代码](#sample-code)。

### 1. 准备两个副本，取得原始 HTML

先将目标邮件另存为 Unicode MSG 留底。在 Outlook 中新建测试 PST，例如 `C:\MailTest\RepairTest.pst`，在其中建立 `HTML修复对照` 和 `HTML修复实验` 两个文件夹，各复制一封原邮件。主题保持不变，用文件夹区分。测试库先排除自动清洗和移动规则，避免其他操作同时改动副本。

复制完成后，先用相同条件检查两份副本。若原样副本已经能搜到，就记录“复制后恢复”；后续再修改 HTML，无法单凭成功结果判断是哪项改动起了作用。

选中对照件，运行导出脚本；再选中实验件，换一个目录运行一次：

```powershell
powershell.exe -STA -File .\Export-SelectedMailHtml.ps1 -OutDir .\control
powershell.exe -STA -File .\Export-SelectedMailHtml.ps1 -OutDir .\experiment
```

两条命令要分开运行，中间先在 Outlook 切换选中的邮件。每次会生成 `original.html`、`original.msg` 和包含 `StoreID + EntryID` 的 `target.json`。

这里直接读取 `MailItem.HTMLBody`。Outlook 的“另存为 HTML”可能重新生成结构，不适合充当这次逐字符比较的输入。导出脚本要求选中一封本地 PST 中的普通 HTML 邮件，已有输出目录会拒绝覆盖。

### 2. 预览具体删了什么

对实验件运行：

```text
python preview_word_html.py experiment/original.html experiment/preview.html
```

脚本输出实际替换数和 diff。如果把前文两块 XML、一条 VML 声明放进同一份合成 HTML，预期是：

```text
{'xml_blocks': 2, 'vml_declarations': 1} would_change = True
```

真实邮件的数量可以不同。`would_change = False` 表示这份输入不在示例的处理范围内，脚本不会写预览文件。

这版代码保留非 XML 条件内容、`!mso` 分支的其他部分和 `<v:shape>`，不把 `&lt;xml&gt;` 解码成标签；处理 VML 时跳过 CSS 注释和字符串。它只覆盖列明的生成格式，不解析嵌套条件。包含嵌套的样本先人工检查，不直接运行；其他 XML、内联样式和不同的 VML 写法另行处理。

审查 diff 时，确认删除集中在目标 XML 块和声明。`p.MsoNormal`、表格、普通 CSS、正文与 `cid:` 引用应留在原处。若出现整段正文或图片消失，先停在预览这一步。

### 3. 两份邮件分别保存，再比较

检查回写脚本中的 `$testPst` 是否指向自己新建的测试文件，然后运行：

```powershell
powershell.exe -STA -File .\Test-MailHtml.ps1 -WorkDir .\control -Mode control
powershell.exe -STA -File .\Test-MailHtml.ps1 -WorkDir .\experiment -Mode experiment
```

对照件仅调用 `Save()`；实验件读取 `preview.html`，赋给 `HTMLBody` 后保存。脚本按导出时的标识找邮件，同时检查测试 PST 路径、文件夹和原正文，防止写到另一个对象。两次都会将保存后读回的 HTML 留在对应目录。

`HTMLBody` 赋值还会立即更新 `Body`，所以要检查读回结果。[MailItem.HTMLBody 属性说明](https://learn.microsoft.com/en-us/office/vba/api/outlook.mailitem.htmlbody)。

| 验收项 | 看什么 |
| --- | --- |
| 实际保存内容 | 读回 HTML，检查是否发生额外结构变化 |
| Outlook 外观 | 阅读窗格和独立窗口中的行距、表格、图片、签名 |
| 附件与 CID | 引用对应的附件存在，数量和内容一致 |
| 邮件主索引记录 | 找到该项目本身，不能用附件条目代替 |
| 原来失败的查询 | 同一范围内，用原来的主题或正文条件再次搜索 |
| 会话关系 | “此对话中的邮件”能否仍找到相关往来 |

如果验证的是 Windows Search，实验全程保持该路径启用。关闭索引依赖后搜到了，验证的是另一种搜索方式。

历史里还做过两份 HTML 的 Edge 无头截图，前后 PNG 哈希相同。它只能补充说明那两次浏览器渲染没有差异；经典 Outlook 使用 Word，且导出的 CID 图片未必完整还原，外观验收仍要回到 Outlook 做。

## 批量处理：清单里有邮件，不等于每封都要改

20 封样本复查后，我把处理范围扩大。原样副本留在“待修复邮件”，处理结果进入“已修复邮件”，核对对应关系后再替换回原位置。

其中一轮实际处理 1,584 项：**1,030 项发生处理，554 项原样放行**。最终对应替换了 1,626 项，主收件箱项目数前后不变，备份集合也保留着。其他历史库和归档目录随后分别处理，详细数字留在[批次记录](#batch-records)。

这一步比清洗函数更容易出错的是“对应到哪封”。`EntryID` 跨 PST 移动后会变化，`Message-ID` 和 `PR_SEARCH_KEY` 又可能被多个归档副本共享。[EntryID 的变化条件](https://learn.microsoft.com/en-us/office/vba/api/outlook.mailitem.entryid)、[MAPI 记录键与搜索键](https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/mapi-record-and-search-keys)。

我需要留下原存储、原文件夹、原件与备份、处理后副本及目标位置之间的映射；定位至少包含 `StoreID + EntryID`，并用时间、主题和消息属性交叉核对。找出多个对应项时，先单独列出来。

HTML 备份只能恢复正文。附件、原位置和完整 MAPI 属性还要靠 MSG 或 PST 备份。替换工作流通过后，索引覆盖率仍然需要另查。

## “索引完成”以后，仍然有邮件搜不到

批量替换后，一封 11 月 6 日收到的技术回复又搜不到了。我重新把收件箱实际项目与索引逐项对应。

一轮快照是 **4,949 个实际项目、4,148 个对应的邮件主记录**，仍有明显缺口。

重新保存后，一部分邮件补进了索引，目标技术回复也能搜到了。保存动作和索引时机同样会改变结果，因此不能把所有遗漏都归到 XML/VML。

11 月 8 日 05:31 的逐项核验又留下这组记录：

| 本轮主收件箱核验 | 数量 |
| --- | ---: |
| 实际项目 | 4,948 |
| 在 SystemIndex 中精确匹配的项目主记录 | 4,842 |
| 未匹配项目 | 106 |
| 其中普通邮件 `IPM.Note` | 84 |
| 其中会议请求 | 19 |
| 其中会议取消通知 | 3 |

表中的分子、分母来自同一时刻、同一文件夹。22 个会议项目单独保留，继续核对类型、索引类别和搜索范围。

### 附件有记录，邮件主记录却没有

剩下 84 封普通邮件，平均约 2,810 KB，其中 74 封带附件，42 封超过 1 MB。大附件占比高，但清单中也有很小、没有附件的邮件。

更有意思的是，39 封找到了相关的附件索引条目，却仍没有精确匹配到邮件主记录。

例如，索引中可以存在概念上这样的两个层次：

```text
邮件项目 URL
邮件项目 URL /at=附件标识
```

后一行存在，不等于前一行存在。把附件 URL 截掉 `/at=…`，再将所得前缀塞进“已索引邮件集合”，会凭空补出一封已经入库的父邮件。

这与“附件相关查询有结果，主题却搜不到”的部分现象相符；具体能搜到哪些字段仍需实测。超时阈值以及小邮件遗漏的原因，这次没有查清。

对账时，固定同一 PST、文件夹、时间点和项目类型，枚举实际对象，再核对完整的主项目 URL。结果分成“精确匹配、未匹配、只有附件条目、特殊项目、查询错误”。查询异常记为未知，最后再用已知遗漏样本搜索。[只读查询入口和映射注意事项](#index-notes)放在文末。

### 会话查找是另外一层

那封技术回复恢复主题搜索后，右键查找同一对话却只能找到它自己；从其他相关邮件查找，又没有它。

排查涉及 `Subject`、规范化主题、`ConversationTopic`、`ConversationIndex`，以及消息头中的 `References`、`In-Reply-To`。中途试改过中英文混合的回复前缀，后来又按原件恢复。正文修复应把这些属性留在原处；若会话异常，就读取实际属性和原件对照，不与全文搜索混为一谈。

重复邮件也要看消息头、Message-ID、正文、附件和在线记录。相近时间的同标题邮件，既可能是对方补发，也可能是本地规则复制，不能仅凭标题去重。

## 工具化时，最需要防的是规则悄悄变宽

后来把样本处理整理成了增量插件和批量工具，新的问题出在匹配范围上。

### 为什么又报出 2,721 封

一次全库检查又报出 2,721 个候选。我先以为修复失效，查代码和扫描范围后才发现，判据已经变了。

早期先对账，找未匹配到索引的邮件，再检查它们的 HTML。后来的工具扩大到更多文件夹，也检查原先就能入库的邮件；同时，它的一个判断条件变成了：

```csharp
html.IndexOf("mso 9", StringComparison.OrdinalIgnoreCase) >= 0
```

这个表达式只能证明字符串出现过。正常模板、正文里的技术说明、转义后的标签文本，都可能命中。

不同时间窗口、收件箱与全部文件夹、是否包含在线邮箱，还出现过 9、29、58、145 等结果，范围对照留在[批次记录](#batch-records)。后来固定为只查本地 PST 副本，在线企业邮箱不进入检查和修改。

### 注释说“只删 XML”，正则不一定真的这样做

再看历史包里的最终工具，清理规则实际包括：

```text
删除所有匹配的 !mso 条件块
删除所有匹配的 gte mso 9 条件块
在整篇 HTML 中删除 VML behavior 字串
```

第二条没有要求里面必须是 XML，第一条也没有要求里面只有 VML 样式。这比“只针对选中的 XML 条件块和 VML 行为”宽得多。

注释中的“只删 XML”没有落实到匹配条件里。这里需要检查实际正则和 diff。

### 58 条成功记录，实际有 57 份 HTML 变化

拿当月 58 封备份，按原工具规则在内存中重放，结果是：

| 原备份中的特征 | 数量 | 原规则重放结果 |
| --- | ---: | --- |
| 同时含 VML 与目标 Word XML | 45 | HTML 有变化 |
| 含目标 Word XML | 12 | HTML 有变化 |
| 只被宽松字符串检查命中，相关结构已转义 | 1 | HTML 没有变化 |

最后那封里能看到转义文本，不等于存在同样的可执行 XML 结构。旧工具仍然保存、记了一条 `SUCCESS`，于是日志数量比实际改变的 HTML 多一份。

这组记录删掉的 114 个目标条件块，正好是 57 个 `shapedefaults` 和 57 个 `shapelayout`。本文示例选取这两类结构，就是依据这些样本。是否需要改某封邮件，还要看它本身的显示和检索问题。

工具报告至少应区分四个数字：**扫描了多少、命中特征多少、正文实际改了多少、另行验证搜索恢复了多少。** 如果只读扫描没有查询索引，最后一个数就应留空，而不是填成命中数。

## 留下两个工具入口：增量插件和按需批量检查

方案 A 监听本地目标文件夹的 `Items.ItemAdd`：在线邮箱收信，既有规则复制到本地后，才检查新副本。方案 B 处理存量和补查，按需运行，不开后台定时轮询。两者的操作范围和记录查询整理进独立 Skill。

```text
规则复制到允许的本地 PST
    ↓ ItemAdd
检查类型、正文状态和是否实际有改动
    ↓
备份 → 保存 → 读回 → 记账
```

签名、加密、会议和撤回消息先排除；VPN 断开、正文不完整或 COM 访问失败时跳过，避免反复重试。存量扫描和未监听期间的邮件交给方案 B。

微软明确说明，大量项目同时加入时 `ItemAdd` 可能不触发；新建目录也需要核对监听。[ItemAdd 的限制](https://learn.microsoft.com/en-us/office/vba/api/outlook.items.itemadd)。原型只挂了根目录下第一层文件夹，保留的 567 条处理日志又全部来自 `BATCH_TOOL`，所以当时能确认插件启动和挂钩，但还没有一份真实新信从触发、处理到保存的完整日志。

插件乱码、勾选后又掉、接口和运行状态的排查放在[插件备忘](#plugin-notes)。方案 A 的原型同步执行，方案 B 也依赖 Outlook COM，大量处理仍可能让客户端等待。

### 每次写回都要能找到原件

原型里还发现过备份失败仍写回、同月覆盖旧备份、恢复定位不足的问题。后续整理时补上了这些约束：

- 原文、定位记录和预写日志都成功落盘，再允许回写；备份失败就停止该项。
- 每次操作使用独立编号，不覆盖更早的原文。
- 保存 `StoreID`、`EntryID`、原文哈希和保存后读回的哈希。
- 回滚前检查当前正文是否又被修改；邮件已迁移或匹配不唯一时停止自动恢复。
- 检测与清理共用同一套边界，只有 `WouldChange` 为真才进入修改。

后续整理的源码放在 [outlook-mail-cleaner](https://github.com/se7enmuting/outlook-mail-cleaner)。它将一般 MSO 标记与可处理候选分开，保留非 XML 条件内容和图片回退，默认只读检查，自动处理需指定允许的本地 PST。

公开整理版已做离线验证，目标机器上的 COM 加载、显示和索引效果仍需实测。使用时记录版本，按前面的单封流程先验证。

<a id="daily-search"></a>

## 日常最后采用的方案：分卷，切回内置搜索

XML/VML 处理让那批样本通过了检查，索引主记录遗漏等问题却还没有全部解决。

前面的分卷这时派上了用场。仅在同一 PST 中分文件夹，物理上仍是原来的大文件；后来拆成 `2020及以前.pst`、`2021-2024.pst`、`2025-现在.pst`，近期收件箱降到约五千项。迁移中的日期、规则、分类、S/MIME 和存储路径问题，另留在[迁移备忘](#migration-notes)。

11 月 8 日早上，我把 `PreventIndexingOutlook` 设为 `1`，切回内置搜索。近期库里的等待时间可以接受，日常使用就先这样稳定下来。

微软文档说明了这个策略的作用：禁用 Outlook 的 Windows Desktop Search 依赖后，改用内置搜索。该文档涉及另一次已修复的故障，这里只引用开关用法。[微软的搜索替代方案说明](https://support.microsoft.com/en-us/support/known-issues/outlook-search-might-not-display-recent-emails-on-windows-11)。

操作前先记录这个值原本是否存在、数值是多少。管理员终端中设置：

```cmd
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v PreventIndexingOutlook /t REG_DWORD /d 1 /f
```

然后重启 Outlook。搜索时可能看到组策略关闭 Windows Search、性能受影响的提示。这里调整的是 Outlook 相关策略，不是停止整台电脑的 Windows Search 服务。

需要恢复时，恢复操作前的状态。如果原来没有这个值，可以删除自己新增的这一项：

```cmd
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v PreventIndexingOutlook /f
```

如果原来已有值，就恢复原值；企业策略统一管理的环境应以组织配置为准。

约五千封时的速度是我这台机器的体验。主题、正文和附件相关查询仍要分别实测，搜索范围和下载完整性也要核对。

高级查找在这次实验中也漏过同一封目标邮件，查询中还见到过 `ci_phrasematch` 这类内容索引运算符。是否绕过索引，要以所用条件和环境的实际结果判断。

那封邮件最后少了 405 个字符，原来的正文和排版留住了。下次遇到同类问题，我会先保存样本、比较改动，再逐项检查显示和搜索结果。有了这份记录，就不必从头猜起。


---

<a id="sample-code"></a>

## 附一：单封复现代码

将以下三个代码块分别保存为对应文件名。它们用于测试 PST 中的单封实验，不遍历邮箱。PowerShell 脚本保存为 **UTF-8 with BOM**，用与 Outlook 相同的普通用户运行 Windows PowerShell 5.1；Python 脚本保存为 UTF-8 即可。

### Export-SelectedMailHtml.ps1：导出当前选中的单封邮件

```powershell
param([string]$OutDir = '.\experiment')
$ErrorActionPreference = 'Stop'
$app = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
$selection = $app.ActiveExplorer().Selection
if ($selection.Count -ne 1) { throw '请在 Outlook 中只选中一封测试邮件。' }
$mail = $selection.Item(1)
$folder = $mail.Parent
$store = $folder.Store
if (-not $store.IsDataFileStore -or $store.ExchangeStoreType -ne 3 -or
    [IO.Path]::GetExtension($store.FilePath) -ine '.pst' -or
    $mail.MessageClass -ne 'IPM.Note' -or $mail.BodyFormat -ne 2) {
    throw '仅接受本地非 Exchange PST 中的普通 HTML 邮件。'
}
$dir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir)
if (Test-Path -LiteralPath $dir) { throw '输出目录已存在，请换一个新目录。' }
$null = New-Item -ItemType Directory -Path $dir
$utf8 = [Text.UTF8Encoding]::new($false)
$mail.SaveAs((Join-Path $dir 'original.msg'), 9)  # olMSGUnicode
[IO.File]::WriteAllText((Join-Path $dir 'original.html'), $mail.HTMLBody, $utf8)
$meta = [ordered]@{
    StoreID = $store.StoreID
    EntryID = $mail.EntryID
    PstPath = $store.FilePath
    Folder = $folder.Name
}
[IO.File]::WriteAllText((Join-Path $dir 'target.json'),
    ($meta | ConvertTo-Json), $utf8)
Write-Output "已导出：$dir"
```

导出代码中的 `SaveAs(..., 9)` 使用 Unicode MSG 格式，枚举值见[微软 OlSaveAsType 定义](https://learn.microsoft.com/en-us/office/vba/api/outlook.olsaveastype)。

### preview_word_html.py：只生成预览，不连接 Outlook

```python
from pathlib import Path
import difflib
import re
import sys

FLAGS = re.IGNORECASE | re.DOTALL

# 只接受这里列明的两种 XML 内部结构。
SHAPE_DEFAULTS = r'<o:shapedefaults\b[^<>]*/>'
SHAPE_LAYOUT = (
    r'<o:shapelayout\b[^<>]*>\s*'
    r'<o:idmap\b[^<>]*/>\s*</o:shapelayout>'
)
WORD_XML = re.compile(
    r'<!--\s*\[if\s+gte\s+mso\s+9\]>\s*<xml>\s*'
    r'(?:' + SHAPE_DEFAULTS + r'|' + SHAPE_LAYOUT + r')'
    r'\s*</xml>\s*<!\[endif\]\s*-->',
    FLAGS,
)
# 只处理内容完整且仅含一个 style 的已知 !mso 外壳。
VML_STYLE_WRAPPER = re.compile(
    r'<!--\s*\[if\s+!mso\]>\s*'
    r'<style\b[^>]*>.*?</style\s*>\s*<!\[endif\]\s*-->',
    FLAGS,
)
HTML_TOKEN = re.compile(
    r'(?P<style><style\b[^>]*>.*?</style\s*>)'
    r'|<script\b[^>]*>.*?</script\s*>'
    r'|(?P<comment><!--.*?-->)',
    FLAGS,
)
# 先完整匹配注释、引号字符串；只删除最后的命名组。
# 这样正文样式中的 content:"{behavior:...}" 会原样保留。
CSS_TOKEN = re.compile(
    r'/\*.*?\*/'
    r'|"(?:\\.|[^"\\])*"'
    r"|'(?:\\.|[^'\\])*'"
    r'|(?P<vml>(?<=[{;])\s*behavior\s*:\s*'
    r'url\(\s*#default#VML\s*\)\s*;?)',
    FLAGS,
)


def preview(original):
    # 示例的处理上限；更大的输入交给人工检查。
    if len(original) > 2_000_000:
        raise ValueError('样本超过此示例的字符上限')

    xml_count = 0
    vml_count = 0

    def edit_token(token):
        nonlocal vml_count
        if token.group('vml') is not None:
            vml_count += 1
            return ''
        return token.group(0)

    def edit_html(token):
        nonlocal xml_count
        text = token.group(0)
        if token.group('comment') is not None and WORD_XML.fullmatch(text):
            xml_count += 1
            return ''
        if token.group('style') is not None or VML_STYLE_WRAPPER.fullmatch(text):
            return CSS_TOKEN.sub(edit_token, text)
        return text

    after = HTML_TOKEN.sub(edit_html, original)
    return after, {'xml_blocks': xml_count, 'vml_declarations': vml_count}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(
            '用法: python preview_word_html.py original.html preview.html'
        )
    # 不猜编码，不改换行符；编码不符就停止。
    original = Path(sys.argv[1]).read_bytes().decode('utf-8')
    after, counts = preview(original)
    print(counts, 'would_change =', after != original)
    if after == original:
        raise SystemExit('没有匹配到此示例会处理的结构，未写文件。')
    # x 模式拒绝覆盖已有文件，包括原输入文件。
    with Path(sys.argv[2]).open('x', encoding='utf-8', newline='') as out:
        out.write(after)
    print('\n'.join(difflib.unified_diff(
        original.splitlines(), after.splitlines(),
        fromfile='original', tofile='preview', lineterm='',
    )))
```

这段正则只覆盖已列明的生成格式，不是完整的 HTML/CSS 解析器。HTML 层区分样式、脚本和注释；只对完整匹配的 XML 条件块、普通样式块，以及仅包着样式的已知 `!mso` 外壳进入处理。处理 VML 时，CSS 注释和单双引号字符串先整体匹配、原样返回。嵌套条件或其他未覆盖格式，先人工检查。

### Test-MailHtml.ps1：在指定测试 PST 中保存对照件或实验件

先将 `$testPst` 改为测试 PST 的实际绝对路径。脚本要求邮件位于根目录下的 `HTML修复对照` 或 `HTML修复实验` 文件夹；路径、位置或内容对不上就停止。

```powershell
param(
    [Parameter(Mandatory=$true)][string]$WorkDir,
    [ValidateSet('control','experiment')][string]$Mode = 'experiment'
)
$ErrorActionPreference = 'Stop'
$testPst = [IO.Path]::GetFullPath('C:\MailTest\RepairTest.pst')
$dir = (Resolve-Path -LiteralPath $WorkDir).Path
$meta = Get-Content -LiteralPath (Join-Path $dir 'target.json') -Raw -Encoding UTF8 |
    ConvertFrom-Json
$original = [IO.File]::ReadAllText((Join-Path $dir 'original.html'))
if (-not (Test-Path -LiteralPath (Join-Path $dir 'original.msg'))) {
    throw '缺少导出时的完整 MSG 备份。'
}
$afterPath = Join-Path $dir 'after-saved.html'
if (Test-Path -LiteralPath $afterPath) { throw '本目录已有保存结果，请勿重复执行。' }
$app = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
$mail = $app.Session.GetItemFromID($meta.EntryID, $meta.StoreID)
$folder = $mail.Parent
$store = $folder.Store
$expectedFolder = if ($Mode -eq 'control') { 'HTML修复对照' } else { 'HTML修复实验' }
if (-not $store.IsDataFileStore -or $store.ExchangeStoreType -ne 3 -or
    [IO.Path]::GetExtension($store.FilePath) -ine '.pst' -or
    -not [string]::Equals([IO.Path]::GetFullPath($store.FilePath), $testPst,
        [StringComparison]::OrdinalIgnoreCase) -or
    $folder.Name -cne $expectedFolder -or
    $folder.Parent.EntryID -ne $store.GetRootFolder().EntryID -or
    $mail.MessageClass -ne 'IPM.Note' -or $mail.BodyFormat -ne 2) {
    throw '邮件不在指定测试 PST 的目标文件夹，或不属于普通 HTML 邮件。'
}
if ($mail.HTMLBody -cne $original) { throw '正文与导出时不同，请重新导出、预览。' }
if ($Mode -eq 'experiment') {
    $preview = [IO.File]::ReadAllText((Join-Path $dir 'preview.html'))
    if ($preview -ceq $original) { throw '预览没有改动。' }
    $mail.HTMLBody = $preview
}
$mail.Save()
[IO.File]::WriteAllText($afterPath, $mail.HTMLBody, [Text.UTF8Encoding]::new($false))
Write-Output "已保存并读回：$afterPath；显示与搜索效果仍需另行检查。"
```

如果回写或读回报错，先保留现场，检查测试副本与 MSG 备份；报错并不保证保存尚未发生。对照结束后，按原来的查询条件、同一搜索范围比较两份副本，记录观察时间。


<a id="batch-records"></a>

## 附二：批次数字，按当时范围留档

这些记录来自不同快照和清单，存在时间变化、重复归档和范围交集，不能相加为“修好多少封坏邮件”。

| 阶段或范围 | 记录 | 备注 |
| --- | --- | --- |
| 首轮主收件箱对账 | 实项 4,946，匹配 3,324，差额 1,622 | 后续待处理集合成为 1,626，不倒填此轮算式 |
| 20 封之后的继续批处理 | 计划 1,606，启动时实际剩余 1,584；1,030 处理、554 放行、该轮报告 0 失败 | 已处理及已有副本影响了待办集合 |
| 替换前的副本核对 | 一度 1,627 对 1,626，清掉多出的测试项 | 数量一致后再继续 |
| 主收件箱对应替换 | 1,626 项；收件箱前后均 4,951；待修复备份 1,626，已修复目录清空 | 验证替换流程，索引另验 |
| 主力库备份归档 | 437 个未匹配项，其中 169 命中 HTML 特征，430 找到主收件箱对应副本 | 169 是子集；该轮部分分类汇总未闭合，未声称 437 全部同法成功 |
| 2021—2024 历史库 | 一轮 311 个待处理项 | 候选清单 |
| 2020 及以前历史库 | 一轮 56 个待处理项 | 候选清单 |
| 后续主收件箱快照 | 实项 4,949，主记录匹配 4,148 | 不是最终快照 |
| 11 月 8 日 05:31 主收件箱 | 实项 4,948，主记录匹配 4,842；剩余 106 | 84 普通邮件、19 会议请求、3 会议取消；先前口头报告中的 4,865 不适用于这份原始记录 |

后续体检还有一组范围变化：

| 检查范围 | 扫描项目 | 旧规则命中 |
| --- | ---: | ---: |
| 主力库收件箱，近期窗口 | 59 | 9 |
| 主力库收件箱，当月 | 121 | 29 |
| 主力库全部当月文件夹 | 215 | 58 |
| 包含在线邮箱的更大范围 | 不与前列直接比较 | 145，其中本地 58、在线 87 |

另有一份抽查报告把查询列错误、`E_FAIL` 异常写成“仍在索引中”，末尾又写“全部核验完成”。这些项只能记为查询未知，不能放进已通过的分子。

<a id="index-notes"></a>

## 附三：只读查询索引与系统层线索

Windows Search 用带协议的 URL 表示项目；Outlook 条目常见 `mapi16://`。URL 还涉及用户和存储身份，不是磁盘文件名的简单拼接。[Windows Search 团队对项目 URL 的说明](https://devblogs.microsoft.com/windows-search-platform/whats-in-my-index/)。

下面是一个只读的入口，用来先看看当前用户实际有哪些 Outlook 索引 URL。请在运行 Outlook 的同一用户下使用，输出可能包含私人邮件标题，不要原样贴到公开问题单。

```powershell
$conn = New-Object -ComObject ADODB.Connection
$rs = $null
try {
    $conn.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
    $sql = @"
SELECT TOP 20 System.ItemUrl, System.ItemName
FROM SystemIndex
WHERE System.ItemUrl LIKE 'mapi16:%'
"@
    $rs = $conn.Execute($sql)
    while (-not $rs.EOF) {
        [pscustomobject]@{
            Url  = $rs.Fields.Item('System.ItemUrl').Value
            Name = $rs.Fields.Item('System.ItemName').Value
        }
        $rs.MoveNext()
    }
}
finally {
    if ($null -ne $rs) {
        if ($rs.State -ne 0) { $rs.Close() }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($rs)
    }
    if ($conn.State -ne 0) { $conn.Close() }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($conn)
}
```

它只是观察入口，不是覆盖率脚本。不同环境要先确认实际协议、可查询字段、索引是否启用，以及当前存储前缀。没有查到 `mapi16:`，不等于邮件已丢失。[Windows Search SQL 语法](https://learn.microsoft.com/en-us/windows/win32/search/-search-sql-ovwofsearchquery)。

真正的覆盖率，需要固定同一 PST、同一文件夹、同一时间点和项目类型，枚举实际对象，再逐一核对对应的**完整主项目 URL**。先用几封已知邮件验证映射；迁移或重新挂载后重新识别存储身份，不照搬旧 SID、旧前缀或实验中硬编码的 URL 转换。

记录中至少分出：精确匹配、未匹配、只有附件条目、特殊项目、查询错误。最后再拿已知遗漏样本做实际搜索。

系统日志出现过事件 ID 10024，提示筛选进程无响应并被终止；也检查过组件、进程和二进制字符串。现有记录缺少稳定的单变量复现与调用栈，尚不能定位到某个 Windows 版本的 AI 语义模块，更不能证明每个遗漏项都有相同的失败原因。

<a id="migration-notes"></a>

## 附四：PST 迁移备忘

迁移时，新旧 PST 同时挂载，核对完成后再调整规则与日常使用位置。以下问题都实际碰到过。

| 问题 | 当时怎么暴露 | 下次要落实的检查 |
| --- | --- | --- |
| 已发送邮件漏迁 | 只用收件日期筛选，覆盖不了发送目录的全部情况 | 收件箱与已发送分别定义日期口径，检查异常日期和边界时刻 |
| 文件夹架构不完整 | 新库邮件有了，某些自建归档目录没跟上 | 迁移前后对比完整目录树及各目录项目数 |
| 规则仍指向旧库 | 新 PST 建好，复制动作还落在原来的位置 | 逐条核对规则目标，并用一封实际新邮件验证落点 |
| 分类名称、颜色不一致 | 邮件上的分类字段与新存储中的分类列表不完全对应 | 比较存储级分类清单和实际显示 |
| 公告规则误收业务回复 | 业务邮件引用了系统通知标题，同样命中主题条件 | 加入明确的系统发件人条件，核对复制和移动的区别 |
| 删除邮件后文件仍很大 | PST 仍占原来的磁盘空间 | 逻辑删除不等于物理压缩；整理完再考虑压缩或新库迁移 |

公告搬运还曾卡在约第 1,298 项附近。后续样本涉及 `IPM.Note.SMIME.MultipartSigned` 等签名邮件，以及撤回通知。对它们调用复制、移动或读取，可能进入不同的处理路径；当时怀疑过证书校验、网络等待和交互提示，原始记录不足以把每次停顿都归到同一个原因。

处理思路后来改为区分消息类型、缩小批次，并使用 Outlook 规则完成部分移动。先识别特殊项目，再选操作路径；保留证书校验设置。

还有一次，PST 改名、重新挂载后，Outlook 可以正常打开邮件，索引却一项也没有。排查碰到了路径中 `MailBox` 与 `Mailbox` 的大小写差异，也调整过挂载和搜索范围登记，之后索引恢复。

由于路径表示、重新挂载和范围登记同时变化，单独的大小写因素没有被隔离。再遇到新 PST 零入库，应一起检查实际路径、存储身份、搜索范围与通知状态。


<a id="plugin-notes"></a>

## 附五：插件加载排查

原型先遇到加载项名称乱码，随后又出现勾选、确定后再次打开仍未勾选。

编码问题要分清 `powershell.exe` 与 `pwsh.exe`；安装了 PowerShell 7，不表示启动前者会自动使用后者。加载问题则要查接口、位数、依赖和注册。`IDTExtensibility2` 的接口 GUID 是 `B65AD801-ABAF-11D0-BB8B-00A0C90F2744`，与加载项自己的 CLSID 不是一回事，可以直接对照[微软接口定义](https://learn.microsoft.com/en-us/dotnet/api/extensibility.idtextensibility2?view=visualstudiosdk-2022)。

查看状态也要分开：注册存在、启动加载配置、运行时 `COMAddIn.Connect`、实际监听文件夹，以及有没有一封新副本走完整个处理链。前几项正确，不代表最后一项已经发生。


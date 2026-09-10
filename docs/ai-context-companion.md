# AI Context Companion — 项目立项说明

把磁盘上「给人看的大批量文档文件夹」编译成「给 AI 助手当 context 的文本库」。输入是任意本地目录：课程资料、论文合集、导出的笔记、项目文档、扫描件归档都可以。不绑定任何网盘、LMS 或下载工具。

---

## 1. 要解决什么

助手擅长读文本，不擅长吞下成片的原文件。把一个文件夹直接丢进去时，常见情况是：

- PDF / PPTX 体积到 MB 甚至几十 MB，塞不进 context，或很快烧额度
- 真正有用的是文字；图片、装饰、页眉页脚、整页截图占掉预算
- 扫描件和「每页一张图」的幻灯片几乎没有文字层
- 目录对人类有用，对「这一夹能不能当语料」并不友好：没有清单、没有跳过规则、不知道哪份已经抽过

目标产物不是更小的 PDF，而是**可检索、可引用路径的文本 sidecar**，体积以 KB 计。原件继续给人读；给模型的是文本。

适用的文件夹长什么样都可以，例如：

```text
~/Documents/phys-notes/
  syllabus.pdf
  lectures/
    ch01-slides.pdf          # 可能 30–80 MB，整页截图
    ch01-notes.docx
  papers/
    some-paper.pdf           # 电子版，多半有文字层
  scans/
    handwritten-hw.jpg

~/work/project-docs/
  specs/
  meeting-notes/
  vendor-pdfs/
```

工具不关心这些文件从哪来，只关心它们已经在磁盘上。

---

## 2. 产品主张

1. **任意文件夹。** 用户指定根目录即可。不假设来源、不假设课程结构、不要求事先用某个下载器。
2. **原文件不动。** 只新增 sidecar 与清单，绝不覆盖、删除或改写源文件。
3. **默认本机。** 不把文档传到自己的服务器。云 OCR / 云模型只能 opt-in，默认关。
4. **失败可见。** 抽不出字就标记「无文字层 / 需 OCR」，不要静默交空白 `.md`。
5. **一次处理，多次给助手用。** 输出要能直接 `@` 文件夹、丢给 Cursor / Claude Code / 本地 RAG，而不是每次打开助手再解析一遍原 PDF。

这是文件夹编译器，不是下载器，也不是聊天产品。

---

## 3. 用户流程

```text
指定根目录
  → 扫描（类型、大小、是否已有 sidecar、内容指纹）
  → 预览将做什么（抽文本 / 跳过 / 需 OCR / 已是文本）
  → 用户确认
  → 按文件处理，写 sidecar 与清单
  → 报告：成功 N、无文字层 M、失败 K
```

典型命令形状（名称可改，语义不要改）：

```text
ctx scan   ~/Documents/phys-notes
ctx plan   ~/Documents/phys-notes
ctx build  ~/Documents/phys-notes
ctx status ~/Documents/phys-notes
```

桌面包装可以后做：同一套 core，外面加选文件夹与进度窗。CLI 必须先能单独用完整个闭环。

---

## 4. 输出形态

对每个被处理的源文件，产出一份 Markdown sidecar，前置 YAML：

```markdown
---
source: ch01-slides.pdf
source_rel: lectures/ch01-slides.pdf
bytes: 52428800
pages: 42
extractor: pymupdf
text_layer: sparse
chars: 3180
quality: low
created: 2026-09-10T12:00:00+08:00
---

# ch01-slides

[extractor note] 文字层过稀，可能是扫描件或整页图片。当前未跑 OCR。

## Page 1

...
```

根目录再给助手一份入口，避免模型去读原 PDF：

```text
_ai-context/
  INDEX.md          # 文件夹地图：每份文件的路径、质量、建议是否纳入 context
  MANIFEST.json     # 机器可读：指纹、extractor、状态、跳过原因
  WARNINGS.md       # 无文字层、加密、损坏、过大
```

`INDEX.md` 才是「把这个文件夹丢给 AI」时的默认入口。原件继续给人读、给打印、给以后 OCR。

sidecar 默认与源文件同目录、同主文件名，例如 `lectures/ch01-slides.pdf` → `lectures/ch01-slides.md`。清单集中在输入根下的 `_ai-context/`（或用户指定的输出根），避免和源文件混在一起，又便于整夹丢给助手。

体积预期：

- 有文字层的短文档：数 KB 到数十 KB
- 有文字层的长 PDF：数十 KB 到一两百 KB
- 纯图幻灯片 / 扫描件在未开 OCR 时：sidecar 应很短，且 `quality: low`，不要假装成功

---

## 5. 处理管道

对每个文件：

1. **识别**  
   扩展名 + magic bytes。未知类型进入「原样跳过」或「有限的纯文本拷贝」。

2. **短路**
   - 已是 `.md` / `.txt` / `.csv`：可复制或只编入 INDEX
   - 已有 sidecar 且源文件指纹未变：跳过
   - 超过体积上限：标过大，不读进内存

3. **抽取**  
   按类型选 extractor，得到纯文本（尽量保页码或标题结构）。

4. **归一**  
   去重复页眉页脚、压缩连续空行、UTF-8、统一换行。不做「创意摘要」。第一版默认是**保真抽取**，不是总结。

5. **质检**  
   字符数 / 页、是否像乱码、是否几乎为空。低于阈值 → `quality: low`，写入 WARNINGS，不当成成功语料。

6. **写入**  
   sidecar + 更新 MANIFEST。崩溃可重入：以源文件哈希为幂等键。

第一版明确不做：自动写进编辑器规则、自动上传向量库、自动调用用户的 LLM 做全文摘要。那些是下游，不是本工具的核心。

---

## 6. 抽取策略（按优先级）

### 6.1 PDF

这是主战场。

| 情况             | 做法                              | 结果                      |
| ---------------- | --------------------------------- | ------------------------- |
| 有可用文字层     | PyMuPDF / pdfminer 抽字，按页切块 | KB 级 `.md`               |
| 文字层极稀或为空 | 标记需 OCR，第一版默认跳过光栅化  | sidecar 只有元数据 + 警告 |
| 加密 / 损坏      | 失败可见                          | 不重试死循环              |
| 用户 opt-in OCR  | 后阶段：Tesseract 或本机视觉模型  | 仍写在本机，默认关        |

不要把「删掉 PDF 里的图片另存一个瘦 PDF」当目标。瘦 PDF 对助手仍然不友好，图注和板书还会一起丢。

### 6.2 其它常见格式

| 类型             | 第一版           | 说明                                        |
| ---------------- | ---------------- | ------------------------------------------- |
| `.pptx`          | 应做             | 抽幻灯片备注 + 形状文字；纯图页同样标低质量 |
| `.docx`          | 应做             | 正文 + 标题层级                             |
| `.xlsx`          | 可后置           | 转 Markdown 表或 CSV sidecar，注意巨大表格  |
| 图片 `.png/.jpg` | 默认跳过或只登记 | OCR 与 PDF 扫描件同一开关                   |
| `.html`          | 可后置           | 去导航抽正文                                |
| 视频 / 音频      | 不做             | 不属于「文档 context」第一刀                |
| 已是 `.md/.txt`  | 编入 INDEX       | 不要二次「简化」到失真                      |

### 6.3 明确不走的路

- 把文件默认上传到自建服务或商业解析 API
- 用模型把整份文档压成一段摘要就当成功（摘要丢失可引用细节，和「当 context」不是同一需求）

模型摘要可以是后续可选命令（`ctx distill`），必须和 `ctx build` 分开，并默认本机或用户自己的 API key。

---

## 7. 推荐技术选型

第一版走 **Python CLI**：PDF/Office 生态成熟，打包可以用 PyInstaller / 以后再包成桌面应用。

建议依赖方向（实现时再锁版本）：

- PDF：PyMuPDF（速度与版面信息）为主，必要时 pdfminer 对照
- Office：python-pptx、python-docx
- 清单与配置：纯 JSON / Markdown，不强制数据库
- 指纹：源文件 size + mtime 可作快路径，正式幂等用内容哈希（大文件可采样 + 全文件哈希的策略要写清楚）
- OCR（非 MVP）：Tesseract 本机；不要在 MVP 里绑云 API

架构分层：

```text
cli / tui
  → application（scan / plan / build / status）
    → extractors（pdf, pptx, docx, ...）
    → quality
    → writers（sidecar, index, manifest）
```

extractor 必须可测：用仓库内的小 fixture（有文字层 PDF、纯图 PDF、docx），不要用真实受版权材料当测试数据提交到 git。

---

## 8. MVP

做：

- 指定一个文件夹，递归扫描
- PDF / PPTX / DOCX 抽文字层或 Office 文字
- 写 sidecar、`INDEX.md`、`MANIFEST.json`、`WARNINGS.md`
- 幂等：源文件未变则跳过
- 质检：空提取与过稀文字层必须可见
- 进度与失败按文件报告
- 配置：输入根、输出根（默认同树 sidecar）、体积上限、是否跟随符号链接（默认否）

不做（MVP）：

- OCR
- 与其它应用的进程通信
- 云解析、遥测、账号系统
- 向量库、chunk embedding
- 自动摘要、自动翻译
- 监视文件夹常驻 daemon（可以后做 `ctx watch`）
- 系统资源管理器集成（可后做）

MVP 验收：

- 对「有文字层的 PDF」，sidecar 人能读、助手能引用，体积从 MB 落到 KB
- 对「整页图片 PDF」，不产生看起来成功的长空文，WARNINGS 里有明确原因
- 重复运行不复制出第二份内容，只更新未变化检测
- 原文件字节与路径完全不变
- 把 `_ai-context/INDEX.md` 和若干 sidecar 丢给助手，不需要再附带原 PDF 也能回答文档级问题

---

## 9. 之后可以加、但不要污染 MVP

| 阶段     | 内容                          | 退出条件                                  |
| -------- | ----------------------------- | ----------------------------------------- |
| OCR      | 本机 Tesseract / 用户自备模型 | 扫描件有可用文字，默认仍关闭              |
| distill  | 可选 LLM 摘要或「每页三句话」 | 与 build 产物分开目录，不覆盖保真 sidecar |
| watch    | 监视根目录新文件并增量 build  | 只处理变化，不误伤原件                    |
| desktop  | 选文件夹 + 进度 UI            | CLI 行为保持一致                          |
| RAG 适配 | 按页/按标题切块的额外导出     | 仍是派生数据，不是唯一真源                |

---

## 10. 隐私与合规

- 默认所有解析在用户机器上完成。
- 不建设文档中转服务。
- 若未来提供「用你自己的 API key 做 distill / 视觉 OCR」，密钥只存在本机配置，请求直达用户选择的提供方，本项目不代收文件。
- 日志只保留文件名、大小、extractor、错误码，不写文件正文。
- README 必须说明：输出文本仍可能受原文件版权或保密约定约束，工具只服务个人本机上下文，不提供分享包、网盘同步或去水印。

---

## 11. 给新仓库的起步清单

1. 用本文作为 `spec.md`（可改名，结构保留）。
2. 先做 `scan` + `plan`（只报告，不写盘），确认类型识别和「无文字层」检测，再做 `build`。
3. 准备三类 PDF fixture：文字层充足、文字层为空、加密或损坏。
4. 不要在第一周同时做 OCR 和 GUI。

---

## 12. 一句话收束

原件给人，sidecar 给模型。任意本地文件夹进，可引用的文本库出；做不好的扫描件老实报失败。

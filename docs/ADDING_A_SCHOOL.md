# 添加新学校支持

本文档说明如何为 Better Blackboard 添加新学校的 Blackboard 支持。

## 前提条件

在开始之前,请确保:

1. **已获得该学校的许可** - 确认该学校允许对其 Blackboard 实例进行自动化访问。部分机构的服务条款明确禁止此类操作。
2. **有权访问该学校的 Blackboard** - 你需要一个有效的学生/教职工账号来测试。
3. **了解该学校的 Blackboard 配置** - 不同学校可能使用不同的 Blackboard 版本(Classic/Ultra)、URL 结构或 API 配置。

## 步骤 1: 调研与验证

### 1.1 确认 REST API 可用性

在该学校的 Blackboard 课程页面的浏览器控制台中运行:

```js
fetch('/learn/api/public/v1/users/me?fields=id', { credentials: 'include' })
  .then((r) => r.json())
  .then(console.log)
  .catch(console.error);
```

✅ **期望结果**: 返回包含 `id` 字段的 JSON 对象  
❌ **如果失败**: 该学校可能未启用 public REST API,或需要额外的认证

### 1.2 测试课程与内容 API

使用 `spec.md` 中附录提供的调研脚本(§14)验证:

- 课程列表 (`/users/me/courses`)
- 内容树结构 (`/courses/{pk1}/contents/{contentId}/children`)
- 附件端点 (`/courses/{pk1}/contents/{contentId}/attachments`)
- 分页行为
- `contentHandler.id` 的取值范围

**记录任何与 CUHK(SZ) 不同的行为**,例如:

- 不同的 URL 参数名称
- 额外的 `contentHandler` 类型
- `body` 字段中是否存在未被 API 覆盖的附件链接

### 1.3 记录 URL 结构

记录以下 URL 模式:

- **课程主页**: 用户选择课程的入口页面
- **内容页**: 显示课程材料的页面,通常包含 `course_id` 和 `content_id` 参数
- **登录后的默认跳转页**

## 步骤 2: 创建 Adapter

在 `src/adapters/` 目录下创建一个新文件,命名为 `{schoolid}.ts`(例如 `myschool.ts`)。

### 2.1 基本模板

```typescript
import type { SchoolAdapter, CourseContext } from './types';
import type { Course } from '../core/types';
import { sanitizeSegment } from '../core/naming';

const MYSCHOOL_ORIGIN = 'https://bb.myschool.edu';

/**
 * Adapter for My School Name.
 *
 * ## Verified Characteristics
 * - Blackboard Learn version: [Classic/Ultra/Mixed]
 * - REST API base path: /learn/api/public/v1
 * - Tested with [number] courses across [departments]
 * - [Any specific observations]
 *
 * ## Known Limitations
 * - [Document any known issues or untested scenarios]
 *
 * ## Permission Requirements
 * - optional_host_permissions: https://bb.myschool.edu/*
 */
export const mySchoolAdapter: SchoolAdapter = {
  id: 'myschool',
  displayName: 'My School',
  origin: MYSCHOOL_ORIGIN,

  matches(url: URL): boolean {
    return url.origin === MYSCHOOL_ORIGIN;
  },

  apiBasePath: '/learn/api/public/v1',

  parseCourseContext(url: URL): CourseContext | null {
    // 根据实际 URL 结构调整
    const coursePk1 = url.searchParams.get('course_id');
    const contentPk1 = url.searchParams.get('content_id');
    if (!coursePk1 || !contentPk1) return null;

    return {
      origin: url.origin,
      coursePk1,
      contentPk1,
    };
  },

  courseFolderName(course: Course): string {
    // 可根据学校命名习惯定制
    return sanitizeSegment(course.name);
  },

  // 可选: 仅在 REST API 不足以覆盖所有附件时实现
  // extractFallbackResources(node) { ... }
};

// 导出辅助函数供其他模块使用
export function isMySchoolMainMenu(url: URL): boolean {
  if (!mySchoolAdapter.matches(url)) return false;
  const path = url.pathname;
  return (
    path.includes('/webapps/portal/') ||
    path === '/ultra' ||
    path.startsWith('/ultra/course?') // 无 courseId 参数的课程列表页
  );
}
```

### 2.2 实现注意事项

#### `matches(url)`

- 必须快速且确定性(会在每次页面加载时调用)
- 只检查 origin,不要检查路径(路径检查留给 `parseCourseContext`)
- 考虑使用 `url.hostname` 而非 `url.origin` 如果有多个子域名

#### `parseCourseContext(url)`

- 对非课程页面(主页、设置页等)返回 `null`
- 仔细验证 URL 参数:某些学校可能使用 `courseId` 而非 `course_id`
- 不要假设参数存在:使用 `url.searchParams.get()` 并检查 `null`

#### `courseFolderName(course)`

- 返回值必须已经过 `sanitizeSegment()` 处理
- 考虑学校的课程命名习惯:
  - `course.name` (通常是 "COURSE101:Title" 格式)
  - `course.batchUid` (教务系统编号,可能更简洁)
  - 组合两者

#### `extractFallbackResources()` (可选)

⚠️ **只在以下情况实现**:

- REST API 的 `/attachments` 端点返回不完整的附件列表
- HTML `body` 字段中包含直接的 `bbcswebdav` 链接
- 已在多个课程中验证这不是偶然情况

实现时必须:

- 使用严格的 HTML 解析器(不要用正则表达式)
- 只提取 `bbcswebdav` 或明确的下载链接
- 记录完整的验证过程和样本数据

## 步骤 3: 注册 Adapter

在 `src/adapters/registry.ts` 中添加新 adapter:

```typescript
import { cuhkszAdapter } from './cuhksz';
import { mySchoolAdapter } from './myschool'; // 新增

export const ALL_ADAPTERS: readonly SchoolAdapter[] = [
  cuhkszAdapter,
  mySchoolAdapter, // 新增
];
```

## 步骤 4: 更新权限配置

在 `wxt.config.ts` 的 `optional_host_permissions` 中添加该学校的 origin:

```typescript
manifest: {
  // ...
  optional_host_permissions: [
    'https://bb.cuhk.edu.cn/*',
    'https://bb.myschool.edu/*', // 新增
  ],
  // ...
}
```

在 `web_accessible_resources` 中也添加对应的 matches:

```typescript
web_accessible_resources: [
  {
    resources: ['content-scripts/content.css'],
    matches: [
      'https://bb.cuhk.edu.cn/*',
      'https://bb.myschool.edu/*', // 新增
    ],
    use_dynamic_url: true,
  },
],
```

## 步骤 5: 添加测试夹具

### 5.1 创建 API 响应夹具

在 `tests/fixtures/` 目录下创建 `myschool-api.json`:

```json
{
  "course": {
    "id": "_12345_1",
    "courseId": "DEMO101",
    "name": "DEMO101: Introduction",
    "ultraStatus": "Classic"
  },
  "contentTree": {
    "results": [
      {
        "id": "_folder_1",
        "title": "Week 1",
        "hasChildren": true,
        "contentHandler": { "id": "resource/x-bb-folder" }
      }
    ]
  }
}
```

包含:

- 真实课程的结构样本(脱敏处理)
- 各种 `contentHandler.id` 类型
- 分页响应样本
- 附件响应样本

### 5.2 创建 Adapter 测试

在 `tests/adapters/` 目录下创建 `myschool.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { mySchoolAdapter } from '../../src/adapters/myschool';

describe('mySchoolAdapter', () => {
  it('matches 正确的 origin', () => {
    expect(
      mySchoolAdapter.matches(new URL('https://bb.myschool.edu/path')),
    ).toBe(true);
    expect(mySchoolAdapter.matches(new URL('https://other.edu'))).toBe(false);
  });

  it('解析课程上下文', () => {
    const url = new URL(
      'https://bb.myschool.edu/webapps/blackboard/content/listContent.jsp?course_id=_123_1&content_id=_456_1',
    );
    const context = mySchoolAdapter.parseCourseContext(url);
    expect(context).toEqual({
      origin: 'https://bb.myschool.edu',
      coursePk1: '_123_1',
      contentPk1: '_456_1',
    });
  });

  it('主页不返回上下文', () => {
    const url = new URL(
      'https://bb.myschool.edu/webapps/portal/execute/tabs/tabAction',
    );
    expect(mySchoolAdapter.parseCourseContext(url)).toBeNull();
  });

  it('生成课程文件夹名', () => {
    const course = {
      pk1: '_123_1',
      batchUid: 'DEMO101',
      name: 'DEMO101: Introduction to Something',
      ultraStatus: 'Classic',
    };
    const folderName = mySchoolAdapter.courseFolderName(course);
    expect(folderName).toBeTruthy();
    expect(folderName).not.toContain(':'); // 冒号应该被替换
  });
});
```

确保测试覆盖:

- URL 匹配(正例和反例)
- 课程上下文解析(有效页面和主页)
- 文件夹命名(包含特殊字符的课程名)
- 如果实现了 `extractFallbackResources`,添加 HTML 解析测试

## 步骤 6: 集成测试

### 6.1 构建并手动测试

```bash
pnpm check     # 运行所有检查
pnpm build     # 构建扩展
```

### 6.2 在浏览器中加载扩展

1. 打开 Chrome,进入 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `.output/chrome-mv3` 目录

### 6.3 验证流程

1. **权限申请**: 打开该学校的 Blackboard 页面,点击扩展图标,应该看到正确的学校名称
2. **注入侧栏**: 授权后,侧栏应该在课程内容页面自动出现
3. **内容树加载**: 侧栏应该正确显示课程结构
4. **下载功能**: 选择文件并测试下载

### 6.4 边缘情况测试

- 空文件夹
- 多附件的 `x-bb-document`
- 中文、emoji、超长文件名
- 嵌套深度 > 5 的目录结构
- 页面刷新后状态恢复

## 步骤 7: 文档化

### 7.1 更新 README

在项目 `README.md` 中添加支持的学校列表:

```markdown
## 支持的学校

- ✅ 香港中文大学(深圳) - `bb.cuhk.edu.cn`
- ✅ My School - `bb.myschool.edu` (Beta)
```

### 7.2 在 adapter 文件中记录限制

在 adapter 顶部的注释中明确记录:

- 已验证的 Blackboard 版本和界面
- 测试样本数量(课程数、院系)
- 已知限制(未测试的 handler、未验证的功能)
- 该学校是否有特殊的服务条款要求

### 7.3 创建 SCHOOL_NOTES.md

如果该学校有特殊配置或已知问题,创建 `docs/schools/myschool.md`:

```markdown
# My School Blackboard 集成说明

## 配置特点

- 使用 Classic 界面
- API 路径: `/learn/api/public/v1`
- 需要 VPN 访问

## 已知问题

- 部分旧课程使用不同的 URL 结构
- 某些附件类型需要二次点击确认

## 测试覆盖

- 3 门不同院系课程
- Classic 界面完整测试
- Ultra 界面未测试
```

## 步骤 8: 提交 Pull Request

在 PR 中包含:

1. **新增文件**:
   - `src/adapters/myschool.ts`
   - `tests/adapters/myschool.test.ts`
   - `tests/fixtures/myschool-api.json`
   - `docs/schools/myschool.md` (如果需要)

2. **修改文件**:
   - `src/adapters/registry.ts`
   - `wxt.config.ts`
   - `README.md`

3. **PR 描述**:
   - 学校名称和 Blackboard URL
   - 测试样本数量
   - 已知限制和未测试场景
   - 权限说明和隐私考虑
   - 是否已获得学校许可(或声明仅供个人使用)

## 检查清单

在提交前确认:

- [ ] REST API 响应与 CUHK(SZ) 一致,或已记录差异
- [ ] Adapter 实现了所有必需方法
- [ ] 已添加到 `ALL_ADAPTERS` 注册表
- [ ] 已更新 `wxt.config.ts` 权限
- [ ] 测试覆盖 URL 匹配、上下文解析、文件夹命名
- [ ] 已创建 API 响应夹具
- [ ] `pnpm check` 全部通过
- [ ] 在真实 Blackboard 环境中手动测试通过
- [ ] README 和文档已更新
- [ ] 已记录权限要求和隐私声明

## 常见问题

### Q: 该学校的 Blackboard 使用不同的 URL 参数名?

**A**: 在 `parseCourseContext()` 中调整。例如:

```typescript
const coursePk1 =
  url.searchParams.get('courseId') || url.searchParams.get('course_id');
```

### Q: REST API 返回 403,即使已登录?

**A**: 可能的原因:

1. 学校禁用了 public REST API
2. 需要额外的 OAuth 或 API key(本项目不支持)
3. CORS 策略阻止了请求

如果确认无法使用 REST API,该学校暂时不适合集成。

### Q: 需要实现 `extractFallbackResources` 吗?

**A**: 只在以下情况:

- REST `/attachments` 端点返回空数组,但 HTML `body` 中有明确的下载链接
- 已在多个课程中验证这是常态而非偶然

否则跳过。HTML 解析增加复杂度和维护成本。

### Q: 如何处理 Ultra 和 Classic 混合环境?

**A**: 在 `parseCourseContext()` 中同时支持两种 URL 模式:

```typescript
parseCourseContext(url: URL): CourseContext | null {
  // Classic: /webapps/blackboard/content/listContent.jsp?course_id=...
  if (url.pathname.includes('/webapps/blackboard/')) {
    return this.parseClassicContext(url);
  }
  // Ultra: /ultra/courses/_{pk1}_1/outline
  if (url.pathname.startsWith('/ultra/courses/')) {
    return this.parseUltraContext(url);
  }
  return null;
}
```

但需在真实环境中验证 Ultra 的 REST API 行为。

### Q: 学校的 Blackboard 在校外无法访问?

**A**: 在文档中说明需要 VPN,并在 adapter 注释中记录。扩展本身不处理 VPN 连接。

---

**需要帮助?** 查看 `src/adapters/cuhksz.ts` 作为参考实现,或在项目 issue 中提问。

# DeepCompose 1.1.3

本版完成上一轮复测中剩余的 GB-05 与 GB-10。

## 修复

- 新增 `file_manage` 的 `list_snapshots`、`read_snapshot` 和 `restore_snapshot`：按文件浏览步骤、分页读取写前版本，使用明确快照 ID 和当前内容哈希恢复，应用内部访问快照目录，无需另行授权该目录。
- 快照增加作品根标识；恢复检查目标作品、文件路径、会话、后续手改和删除状态，并在恢复前强制保存当前版本。旧快照缺少作品绑定信息时不自动恢复。
- 搜索返回全局配额和省略统计：`total_matches`、`returned_matches`、`omitted_matches`、`omitted_files`、`returned_chars`、`max_chars`；片段截断或整体省略时 `truncated` 为 true。片段总预算为 24000 UTF-16 单位，完整 JSON（含文件名、元数据和转义）最多 32000 UTF-8 字节；超长搜索词明确报错。
- 每条搜索片段都保留实际搜索词；保留 JSONL、日志搜索、二进制拒读和文件分页续读行为。

## 验证

- TypeScript 类型检查通过。
- Vitest：58 个测试文件，767 通过，9 跳过。
- Rust：36 个测试通过。
- macOS Apple Silicon 包为本机 ad-hoc 签名，未经 Developer ID 签名与 Apple 公证。

详见 [逐项工程验收记录](BUGFIX-2026-10-18.md)。

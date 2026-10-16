// 在被测模块导入前启用 Linux 分支；不代表运行于 Linux 内核或大小写敏感文件系统。
Object.defineProperty(process, "platform", {
  value: "linux",
  configurable: true,
  writable: true,
});

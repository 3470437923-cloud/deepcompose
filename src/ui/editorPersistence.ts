/** 保存策略仅通过注入的读写接口访问磁盘，便于验证等待期间的编辑。 */
export interface EditorVersion {
  path: string;
  rel: string;
  content: string;
  baseContent: string;
  dirty: boolean;
}

export async function persistEditorVersion<T extends EditorVersion>(tab: T, io: {
  read: () => Promise<string>;
  snapshot: (previous: string) => Promise<void>;
  write: (content: string) => Promise<void>;
  update: (apply: (tabs: T[]) => T[]) => void;
  current: () => T[];
}): Promise<boolean> {
  const content = tab.content;
  const previous = await io.read();
  // 采用也会保存未编辑标签：其旧基线仍可能已被 AI 改动，不能直接报告成功。
  if (tab.content === tab.baseContent && !tab.dirty) {
    if (previous !== tab.baseContent) throw new Error("磁盘内容已变更，已保留编辑内容；请先对照磁盘新版后重试保存");
    return isEditorVersionSaved(io.current(), tab);
  }
  await io.snapshot(previous);
  if (previous !== tab.baseContent || await io.read() !== previous) {
    throw new Error("磁盘内容已变更，已保留编辑内容；请先对照磁盘新版后重试保存");
  }
  await io.write(content);
  io.update((tabs) => tabs.map((t) => t.path === tab.path
    ? { ...t, baseContent: content, dirty: t.content !== content } : t));
  return isEditorVersionSaved(io.current(), tab);
}

/** 后续动作只能消费刚刚保存的版本，等待期间的新编辑必须留在原标签。 */
export function isEditorVersionSaved(tabs: EditorVersion[], saved: EditorVersion): boolean {
  const current = tabs.find((tab) => tab.path === saved.path);
  return !!current && !current.dirty && current.content === current.baseContent && current.content === saved.content;
}

export function hasUnsavedEditors(tabs: EditorVersion[]): boolean {
  return tabs.some((tab) => tab.dirty || tab.content !== tab.baseContent);
}

export async function completeReflow(
  send: () => Promise<{ error?: string | null }>,
  complete: () => Promise<void>,
  aborted: () => boolean,
): Promise<void> {
  const result = await send();
  if (result.error) throw new Error(result.error);
  if (aborted()) throw new Error("回流已停止");
  await complete();
}

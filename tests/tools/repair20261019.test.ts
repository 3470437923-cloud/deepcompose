import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { executeTool, type ToolContext } from "../../src/core/tools/exec";
import { createNodeFs } from "../support/nodeFs";
import { loadSnapshots, contentHash } from "../../src/core/store/snapshot";
let root: string;
let ctx: ToolContext;
beforeEach(async () => {
 root = await fs.mkdtemp(path.join(os.tmpdir(), "deepcompose-gb-"));
 ctx = {fs:createNodeFs(), roots:{projectRoot:root, booksRoot:root, skillsDir:path.join(root,"skills")}, booksRoot:root, snapshotsDir:path.join(root,"snapshots"), sessionId:"test"};
});
afterEach(async () => { await fs.rm(root,{recursive:true,force:true}); });
const call = async (tool: string,args: Record<string,unknown>) => JSON.parse(await executeTool(ctx,tool,args));
it("GB-01 reports exact removed text, remaining lines, hash and readable previous version",async()=>{
 const cr=String.fromCharCode(13), lf=String.fromCharCode(10);
 const original="前"+cr+lf+"删除甲"+lf+"删除乙"+cr+"尾";
 await fs.writeFile(path.join(root,"doc.md"),original);
 const r = await call("file_write",{operation:"delete_lines",path:"doc.md",start_line:2,end_line:3});
 expect(r.deleted_content).toBe("删除甲"+lf+"删除乙"+cr);
 expect(r.deleted_lines).toBe(2); expect(r.remaining_lines).toBe(2);
 expect(r.post_content_hash).toBe(await contentHash("前"+cr+lf+"尾"));
 expect(r.snapshot.saved).toBe(true);
 const entries=await loadSnapshots(ctx.fs,ctx.snapshotsDir,ctx.sessionId);
 expect(entries.snapshots.at(-1)?.previousContent).toBe(original);
});
it("GB-03 distinguishes missing file and missing directory",async()=>{
 expect((await call("file_read",{operation:"read",path:"missing.md"})).error).toBe("File not found: missing.md");
 expect((await call("file_read",{operation:"list",path:"missing"})).error).toBe("Directory not found: missing");
});
it("GB-08 exposes modification milliseconds for files and directories",async()=>{
 await fs.writeFile(path.join(root,"doc.md"),"正文");
 await fs.utimes(path.join(root,"doc.md"),1700000000,1700000000);
 const r=await call("file_read",{operation:"list",path:"."});
 expect(r.files.find((e:{name:string})=>e.name==="doc.md").mtime_ms).toBe(1700000000000);
});
it("GB-06 reports actual quote-different text and line without changing file",async()=>{
 const text='标题'+String.fromCharCode(10)+'他说：“明天见。”';
 await fs.writeFile(path.join(root,"doc.md"),text);
 const r=await call("file_write",{operation:"replace",path:"doc.md",old_text:'他说："明天见。"',new_text:"错误改写"});
 expect(r.error).toContain("line 2"); expect(r.error).toContain('他说：“明天见。”');
 expect(await fs.readFile(path.join(root,"doc.md"),"utf8")).toBe(text);
});
it("GB-07 exposes total matches replacements and remaining original text",async()=>{
 await fs.writeFile(path.join(root,"doc.md"),"甲甲甲");
 const r=await call("file_write",{operation:"replace",path:"doc.md",old_text:"甲",new_text:"乙"});
 expect(r.matches_found).toBe(3); expect(r.replacements).toBe(1); expect(r.matches_remaining).toBe(2);
 const all=await call("file_write",{operation:"replace",path:"doc.md",old_text:"甲",new_text:"丙",replace_all:true});
 expect(all.matches_found).toBe(2); expect(all.replacements).toBe(2); expect(all.matches_remaining).toBe(0);
});
it("GB-04 searches JSONL both explicitly and recursively",async()=>{
 await fs.mkdir(path.join(root,"writerd_oplog"));
 await fs.writeFile(path.join(root,"writerd_oplog","log.jsonl"),JSON.stringify({action:"switch_project"}));
 for(const target of ["writerd_oplog/log.jsonl","."]){
 const r=await call("file_manage",{operation:"search",path:target,search_text:"switch_project"});
 expect(r.files_found).toBe(1); expect(r.results[0].matches[0].line).toBe(1);
 }
});
it("GB-10 bounds search excerpts around the actual match and marks truncated lines",async()=>{
 await fs.writeFile(path.join(root,"doc.md"),"前".repeat(10000)+"搜索词"+"后".repeat(10000));
 const r=await call("file_manage",{operation:"search",path:"doc.md",search_text:"搜索词"});
 expect(r.results[0].matches[0].content.length).toBeLessThanOrEqual(500);
 expect(r.results[0].matches[0].content).toContain("搜索词");
 expect(r.results[0].matches[0].truncated).toBe(true);
});
it("GB-05 blocks binary archive reads without dumping bytes",async()=>{
 await fs.writeFile(path.join(root,"migration.zip"),Buffer.from([0x50,0x4b,0x03,0x04,0x00,0x00]));
 await expect(call("file_read",{operation:"read",path:"migration.zip"})).rejects.toThrow("二进制文件不可按文本读取");
});
it("UTF-8 BOM binary archives are also blocked",async()=>{
 await fs.writeFile(path.join(root,"migration.zip"),Buffer.from([0xef,0xbb,0xbf,0x50,0x4b,0x03,0x04]));
 await expect(call("file_read",{operation:"read",path:"migration.zip"})).rejects.toThrow("二进制文件不可按文本读取");
});
it("GB-10 bounds file read output with explicit continuation",async()=>{
 const original="正文".repeat(40000); await fs.writeFile(path.join(root,"doc.md"),original);
 let page=await call("file_read",{operation:"read",path:"doc.md"}); let combined=page.content;
 while(page.truncated){ page=await call("file_read",{operation:"read",path:"doc.md",offset:page.next_offset,char_offset:page.next_char_offset}); combined+=(page.continuation_separator ?? "")+page.content; }
 expect(combined).toBe(original);
});
it("snapshot failure prevents all target writes",async()=>{
 await fs.writeFile(path.join(root,"doc.md"),"原稿");
 const original=ctx.fs.writeText.bind(ctx.fs);
 ctx.fs.writeText=async (p,t)=>{if(p.includes("snapshots"))throw Error("snapshot unavailable"); await original(p,t);};
 await expect(call("file_write",{operation:"write",path:"doc.md",content:"新稿"})).rejects.toThrow("snapshot unavailable");
 expect(await fs.readFile(path.join(root,"doc.md"),"utf8")).toBe("原稿");
});
it("GB-11 missing operation suggests allowed values without assuming an action",async()=>{
 const r=await call("file_read",{path:"doc.md"});
 expect(r.error).toContain("operation is required"); expect(r.error).toContain("read"); expect(r.error).toContain("list");
});
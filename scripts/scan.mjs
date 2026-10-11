import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const paths=JSON.parse(await readFile('PUBLIC_FILES.json','utf8'));
const errors=[],manifest=[];
const patterns=[['private-key',/-----BEGIN [A-Z ]*PRIVATE KEY-----/],['github-token',/gh[pousr]_[A-Za-z0-9]{20,}/],['api-secret',/sk-(?:proj-)?[A-Za-z0-9_-]{25,}/],['local-home-path',new RegExp('/'+'Users/[A-Za-z0-9_.-]+/')],['private-chat-identifiers',/(?:wxid_|ghid_)[a-zA-Z0-9]{8,}/],['credentialed-url',/https?:\/\/[^\s/:]+:[^\s@]+@/]];
for(const file of paths){
 if(file.startsWith('/')||file.includes('..')||/(^|\/)(runtime|node_modules|\.git|\.env|private-research|evidence)(\/|$)/.test(file))errors.push({file,issue:'disallowed-path'});
 const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())errors.push({file,issue:'not-regular-file'});
 const bytes=await readFile(file),text=bytes.toString('utf8');
 for(const [issue,regex]of patterns)if(regex.test(text))errors.push({file,issue});
 manifest.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
console.log(JSON.stringify({passed:errors.length===0,files:manifest.length,scope:'Explicit public allowlist only. Pattern check, not a privacy guarantee.',errors,manifest},null,2));
if(errors.length)process.exitCode=1;

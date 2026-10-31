import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {existsSync, lstatSync, readFileSync, realpathSync, readdirSync} from 'node:fs';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const CONTRACT='GLOW_VIDEO_HOST_ASSEMBLY_V1';
export const DEFAULT_FACTORY_REPOSITORY='digitaltavi-source/GLOW-VIDEO-FACTORY';
const SHA=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const SAFE_FILE=/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/;
const SAFE_REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const packageRoot=resolve(fileURLToPath(new URL('..',import.meta.url)));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw new Error(code)};
const owned=(root,target)=>{const r=relative(root,target);return r!==''&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep)};

function canonicalFuturePath(candidate){
  let part=resolve(candidate);const suffix=[];
  while(true){
    if(existsSync(part))return resolve(realpathSync(part),...suffix);
    const p=resolve(part,'..');if(p===part)fail('STATE_REALPATH_UNRESOLVED');
    suffix.unshift(part.split(/[\\/]/).at(-1));part=p;
  }
}

function checkHttpsUrl(raw,key){
  let u;try{u=new URL(raw)}catch{fail('CONFIG_URL_INVALID_'+key)}
  if(u.protocol!=='https:'||u.username||u.password||u.hash)fail('CONFIG_HTTPS_INVALID_'+key);
  return u;
}

function checkEnv(env,root){
  const major=Number(process.versions.node.split('.')[0]);
  if(!Number.isInteger(major)||major<22||major>=25)fail('NODE22_TO_24_REQUIRED');
  if(!['DEMO','PRODUCTION'].includes(env.GLOW_GATEWAY_PROFILE))fail('GATEWAY_PROFILE_NOT_AUTHORIZED');
  if(env.GLOW_AUTH_MODE!=='oauth')fail('OAUTH_REQUIRED');
  const profile=env.GLOW_OAUTH_AUTHORIZATION_PROFILE||'GLOW_NATIVE_GRANT';
  if(!['GLOW_NATIVE_GRANT','SUPABASE_RESOURCE_GRANT','ACTION_SCOPES'].includes(profile))fail('AUTH_PROFILE_MISMATCH');
  const mcpUrl=checkHttpsUrl(env.GLOW_PUBLIC_MCP_URL,'GLOW_PUBLIC_MCP_URL');
  if(mcpUrl.pathname!=='/mcp-v2'||mcpUrl.search)fail('MCP_RESOURCE_MISMATCH');
  if(profile==='GLOW_NATIVE_GRANT'){
    const secret=String(env.GLOW_NATIVE_OAUTH_SECRET||'').trim();
    if(secret.length<32)fail('GLOW_NATIVE_OAUTH_SECRET_REQUIRED');
    if(env.GLOW_OAUTH_ISSUER)checkHttpsUrl(env.GLOW_OAUTH_ISSUER,'GLOW_OAUTH_ISSUER');
    if(env.GLOW_OAUTH_JWKS_URL)checkHttpsUrl(env.GLOW_OAUTH_JWKS_URL,'GLOW_OAUTH_JWKS_URL');
  }else{
    checkHttpsUrl(env.GLOW_OAUTH_ISSUER,'GLOW_OAUTH_ISSUER');
    checkHttpsUrl(env.GLOW_OAUTH_JWKS_URL,'GLOW_OAUTH_JWKS_URL');
  }
  if(env.GLOW_PUBLIC_ORIGIN){
    let u;try{u=new URL(env.GLOW_PUBLIC_ORIGIN)}catch{fail('ORIGIN_INVALID')}
    if(u.origin!==mcpUrl.origin||u.pathname!=='/'||u.search||u.hash)fail('ORIGIN_MISMATCH');
  }
  const audience=env.GLOW_OAUTH_AUDIENCE?.trim()||(profile==='GLOW_NATIVE_GRANT'?mcpUrl.toString():'');
  if(!audience||!env.GLOW_OAUTH_ALLOWED_CLIENT_IDS?.trim())fail('OAUTH_CLIENT_BINDING_MISSING');
  if(!env.GLOW_V2_STATE_DIR||!isAbsolute(env.GLOW_V2_STATE_DIR))fail('PERSISTENT_STATE_ABSOLUTE_REQUIRED');
  const state=canonicalFuturePath(env.GLOW_V2_STATE_DIR);
  if(state===canonicalFuturePath(root)||owned(canonicalFuturePath(root),state))fail('PERSISTENT_STATE_INSIDE_DEPLOYMENT');
  if(!GIT_SHA.test(env.GLOW_VIDEO_APPROVED_SOURCE_SHA||''))fail('SOURCE_SHA_PIN_REQUIRED');
  if(!SHA.test(env.GLOW_VIDEO_ASSEMBLY_MANIFEST_SHA256||''))fail('ASSEMBLY_HASH_PIN_REQUIRED');
}

function validRelative(p){return typeof p==='string'&&p!=='.'&&p!==''&&SAFE_FILE.test(p)&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(s=>s===''||s==='.'||s==='..')}
function inventory(root,dir=root){
  let names=[];
  for(const e of readdirSync(dir,{withFileTypes:true})){
    const absolute=resolve(dir,e.name);
    const s=lstatSync(absolute);
    if(s.isSymbolicLink())fail('ASSEMBLY_SYMLINK_DENIED');
    if(s.isDirectory())names=names.concat(inventory(root,absolute));
    else if(s.isFile())names.push(relative(root,absolute).split(sep).join('/'));
    else fail('ASSEMBLY_SPECIAL_FILE_DENIED');
  }
  return names;
}

export function verifyAssembly({root=packageRoot,env=process.env}={}){
  root=realpathSync(root);
  checkEnv(env,root);
  const expectedRepo=(env.GLOW_FACTORY_REPOSITORY?.trim()||DEFAULT_FACTORY_REPOSITORY);
  if(!SAFE_REPO.test(expectedRepo))fail('ASSEMBLY_FACTORY_REPOSITORY_INVALID');
  const bundle=resolve(root,'private-runtime');
  if(!existsSync(bundle)||lstatSync(bundle).isSymbolicLink()||!lstatSync(bundle).isDirectory())fail('PRIVATE_ASSEMBLY_MISSING');
  const manifestPath=resolve(bundle,'assembly-manifest.json');
  if(!existsSync(manifestPath)||lstatSync(manifestPath).isSymbolicLink())fail('ASSEMBLY_MANIFEST_MISSING');
  const raw=readFileSync(manifestPath);
  if(digest(raw)!==env.GLOW_VIDEO_ASSEMBLY_MANIFEST_SHA256)fail('ASSEMBLY_MANIFEST_HASH_MISMATCH');
  let manifest;try{manifest=JSON.parse(raw.toString('utf8'))}catch{fail('ASSEMBLY_MANIFEST_INVALID_JSON')}
  if(manifest.contract!==CONTRACT||manifest.source_commit!==env.GLOW_VIDEO_APPROVED_SOURCE_SHA||!GIT_SHA.test(manifest.source_commit))fail('ASSEMBLY_SOURCE_IDENTITY_MISMATCH');
  if(manifest.factory_repository!==expectedRepo)fail('ASSEMBLY_FACTORY_IDENTITY_MISMATCH');
  if(!validRelative(manifest.entry)||!manifest.entry.endsWith('.js'))fail('ASSEMBLY_ENTRY_INVALID');
  if(!Array.isArray(manifest.files)||!manifest.files.length)fail('ASSEMBLY_FILES_MISSING');
  const seen=new Set();
  for(const f of manifest.files){
    if(!f||!validRelative(f.path)||!SHA.test(f.sha256||'')||seen.has(f.path)||f.path==='assembly-manifest.json')fail('ASSEMBLY_FILE_RECORD_INVALID');
    seen.add(f.path);const path=resolve(bundle,f.path);if(!owned(bundle,path)||!existsSync(path)||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())fail('ASSEMBLY_FILE_MISSING_OR_UNSAFE');
    if(digest(readFileSync(path))!==f.sha256)fail('ASSEMBLY_FILE_HASH_MISMATCH');
  }
  if(!seen.has(manifest.entry))fail('ASSEMBLY_ENTRY_NOT_ATTESTED');
  const actual=inventory(bundle).filter(x=>x!=='assembly-manifest.json');
  if(actual.length!==seen.size||actual.some(x=>!seen.has(x)))fail('ASSEMBLY_UNDECLARED_FILE');
  const authProfile=env.GLOW_OAUTH_AUTHORIZATION_PROFILE||'GLOW_NATIVE_GRANT';
  return {
    status:'ASSEMBLY_BYTES_VERIFIED_NOT_RUNTIME_ATTESTED',
    factory_repository:manifest.factory_repository,
    auth_profile:authProfile,
    source_commit:manifest.source_commit,
    files:actual.length,
    entry:resolve(bundle,manifest.entry),
  };
}

function main(){
  const mode=process.argv[2];if(!['--verify','--start'].includes(mode))fail('MODE_UNSUPPORTED');
  const result=verifyAssembly();
  if(mode==='--verify'){
    process.stdout.write(JSON.stringify({
      status:result.status,
      factory_repository:result.factory_repository,
      auth_profile:result.auth_profile,
      source_commit:result.source_commit,
      files:result.files,
    })+'\n');
    return;
  }
  const child=spawn(process.execPath,[result.entry],{cwd:resolve(packageRoot,'private-runtime'),env:process.env,stdio:'inherit',shell:false});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(!child.killed)child.kill(signal)});
  child.on('error',()=>{process.stderr.write('HOST_PRIVATE_RUNTIME_START_FAILED\n');process.exitCode=1});
  child.on('exit',(code,signal)=>{process.exitCode=Number.isInteger(code)?code:signal?1:1});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main()}catch(error){process.stderr.write('HOST_ASSEMBLY_BLOCKED '+(error instanceof Error?error.message:'UNKNOWN')+'\n');process.exitCode=1;}
}

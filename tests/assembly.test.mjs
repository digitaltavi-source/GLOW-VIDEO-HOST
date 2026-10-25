import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {CONTRACT,verifyAssembly} from '../scripts/assembly.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const SOURCE='a'.repeat(40); // synthetic test fixture, NOT a private Factory identity
function fixture(t){
  const root=mkdtempSync(resolve(tmpdir(),'gvf-host-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const bundle=resolve(root,'private-runtime');
  mkdirSync(resolve(bundle,'dist','src'),{recursive:true});
  const code=Buffer.from('export const trial = true;\n');
  writeFileSync(resolve(bundle,'dist','src','server.js'),code);
  const manifest={contract:CONTRACT,factory_repository:'digitaltavi-source/GLOW-VIDEO-FACTORY',source_commit:SOURCE,entry:'dist/src/server.js',files:[{path:'dist/src/server.js',sha256:sha(code)}]};
  const put=()=>{const raw=Buffer.from(JSON.stringify(manifest));writeFileSync(resolve(bundle,'assembly-manifest.json'),raw);return sha(raw)};
  const env={GLOW_GATEWAY_PROFILE:'DEMO',GLOW_AUTH_MODE:'oauth',GLOW_OAUTH_AUTHORIZATION_PROFILE:'SUPABASE_RESOURCE_GRANT',GLOW_PUBLIC_MCP_URL:'https://video.example.org/mcp-v2',GLOW_OAUTH_ISSUER:'https://example.supabase.co/auth/v1',GLOW_OAUTH_JWKS_URL:'https://example.supabase.co/auth/v1/.well-known/jwks.json',GLOW_OAUTH_AUDIENCE:'authenticated',GLOW_OAUTH_ALLOWED_CLIENT_IDS:'known-client',GLOW_V2_STATE_DIR:resolve(root,'..','persistent-factory-state'),GLOW_VIDEO_APPROVED_SOURCE_SHA:SOURCE,GLOW_VIDEO_ASSEMBLY_MANIFEST_SHA256:put()};
  return {root,bundle,manifest,put,env};
}

test('NORMAL: exact manifest, complete files, safe OAuth/stable MCP -> scoped verification',t=>{
  const f=fixture(t);const r=verifyAssembly(f);assert.equal(r.status,'ASSEMBLY_BYTES_VERIFIED_NOT_RUNTIME_ATTESTED');assert.equal(r.source_commit,SOURCE);assert.equal(r.files,1);
});
test('FAILURE: missing private assembly is blocked',t=>{const f=fixture(t);rmSync(f.bundle,{recursive:true,force:true});assert.throws(()=>verifyAssembly(f),/PRIVATE_ASSEMBLY_MISSING/)});
test('FAILURE: stale/mismatched SHA is blocked',t=>{const f=fixture(t);f.env.GLOW_VIDEO_APPROVED_SOURCE_SHA='b'.repeat(40);assert.throws(()=>verifyAssembly(f),/ASSEMBLY_SOURCE_IDENTITY_MISMATCH/)});
test('ADVERSARIAL: manifest tamper is blocked before runtime',t=>{const f=fixture(t);f.manifest.source_commit='b'.repeat(40);f.put();assert.throws(()=>verifyAssembly(f),/ASSEMBLY_MANIFEST_HASH_MISMATCH/)});
test('ADVERSARIAL: file tamper blocks despite unchanged manifest',t=>{const f=fixture(t);writeFileSync(resolve(f.bundle,'dist','src','server.js'),'changed');assert.throws(()=>verifyAssembly(f),/ASSEMBLY_FILE_HASH_MISMATCH/)});
test('ADVERSARIAL: an extra unrecorded file blocks',t=>{const f=fixture(t);writeFileSync(resolve(f.bundle,'secret.env'),'DO_NOT_USE');assert.throws(()=>verifyAssembly(f),/ASSEMBLY_UNDECLARED_FILE/)});
test('ADVERSARIAL: traversal and symlink forbidden',t=>{
 const f=fixture(t);f.manifest.files[0].path='../secret';f.env.GLOW_VIDEO_ASSEMBLY_MANIFEST_SHA256=f.put();assert.throws(()=>verifyAssembly(f),/ASSEMBLY_FILE_RECORD_INVALID/);
 const g=fixture(t);symlinkSync(resolve(g.bundle,'dist','src','server.js'),resolve(g.bundle,'link.js'));assert.throws(()=>verifyAssembly(g),/ASSEMBLY_SYMLINK_DENIED/);
});
test('AUTH: old/wrong endpoint and non-OAuth are blocked',t=>{const f=fixture(t);f.env.GLOW_PUBLIC_MCP_URL='https://video.example.org/mcp';assert.throws(()=>verifyAssembly(f),/MCP_RESOURCE_MISMATCH/);f.env.GLOW_PUBLIC_MCP_URL='https://video.example.org/mcp-v2';f.env.GLOW_AUTH_MODE='static_bearer';assert.throws(()=>verifyAssembly(f),/OAUTH_REQUIRED/)});
test('PERSISTENCE: state under deployment is blocked',t=>{const f=fixture(t);f.env.GLOW_V2_STATE_DIR=resolve(f.root,'data');assert.throws(()=>verifyAssembly(f),/PERSISTENT_STATE_INSIDE_DEPLOYMENT/)});
test('RECOVERY: correct manifest and file restore original PASS without stale permission',t=>{const f=fixture(t);writeFileSync(resolve(f.bundle,'dist','src','server.js'),'broken');assert.throws(()=>verifyAssembly(f),/ASSEMBLY_FILE_HASH_MISMATCH/);writeFileSync(resolve(f.bundle,'dist','src','server.js'),'export const trial = true;\n');assert.equal(verifyAssembly(f).files,1)});

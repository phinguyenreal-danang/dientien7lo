import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname, '..');
const source=join(root,'site'),dest=join(root,'dist');
const repo=(process.env.GITHUB_REPOSITORY||'demo/68property-dientien').split('/');
const base=(repo[1]||'').toLowerCase()===(repo[0]||'').toLowerCase()+'.github.io' ? '/' : `/${repo[1]||'68property-dientien'}/`;
const siteUrl=(process.env.SITE_URL?.trim() || `https://${repo[0]}.github.io${base}`).replace(/\/?$/, '/');
if(!/^https:\/\//.test(siteUrl))throw new Error('SITE_URL must be HTTPS');
await rm(dest,{recursive:true,force:true});
await mkdir(dest,{recursive:true});
await cp(source,dest,{recursive:true});
for(const [file,search,replacement] of [
 ['index.html','https://example.invalid/',siteUrl],
 ['robots.txt','https://example.invalid/',siteUrl],
 ['sitemap.xml','https://example.invalid/',siteUrl]
]){
 const p=join(dest,file);let s=await readFile(p,'utf8');s=s.replaceAll(search,replacement);await writeFile(p,s);
}
const p=join(dest,'index.html');let html=await readFile(p,'utf8');
// Add robots noindex only to local preview? In publication require domain from actions.
if(html.includes('example.invalid'))throw new Error('SEO placeholder remains');
// Set no extra slash in asset canonical values; meta generated in build.
console.log('Built',siteUrl);

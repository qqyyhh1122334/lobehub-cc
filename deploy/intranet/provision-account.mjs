import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const email = process.env.INTRANET_ACCOUNT_EMAIL;
const password = process.env.INTRANET_ACCOUNT_PASSWORD;
if (!email || !password || password.length < 16)
  throw new Error(
    'Set INTRANET_ACCOUNT_EMAIL and INTRANET_ACCOUNT_PASSWORD (16+ characters); do not put passwords in command arguments',
  );
const script = `
(async()=>{
 const origin=process.env.APP_URL;
 const response=await fetch(origin+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:process.env.INTRANET_ACCOUNT_EMAIL,password:process.env.INTRANET_ACCOUNT_PASSWORD,name:process.env.INTRANET_ACCOUNT_EMAIL.split('@')[0]})});
 if(!response.ok)throw new Error('Account provisioning HTTP '+response.status+'; confirm allowed email and whether it already exists');
 const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 if(cookie)await fetch(origin+'/api/auth/sign-out',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:'{}'});
 console.log('Local account created.');
})().catch(error=>{console.error(error.message);process.exitCode=1});
`;
execFileSync(
  'docker',
  [
    'compose',
    '-f',
    'compose.yaml',
    'exec',
    '-T',
    '-e',
    'INTRANET_ACCOUNT_EMAIL',
    '-e',
    'INTRANET_ACCOUNT_PASSWORD',
    'app',
    'node',
    '-',
  ],
  {
    cwd: dirname(fileURLToPath(import.meta.url)),
    input: script,
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);

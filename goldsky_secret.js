const { spawn } = require('child_process');

const url = 'postgresql://neondb_owner:npg_L2WDwVrsMQ9p@ep-damp-haze-ape8sgh0-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const child = spawn('cmd.exe', ['/c', 'goldsky', 'secret', 'create', '--name', 'PHAROSFLOW_PG'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

child.stdout.on('data', d => {
  const out = d.toString();
  console.log('OUT:', out);
  if (out.toLowerCase().includes('value')) {
    console.log('Writing value...');
    child.stdin.write(url + '\n');
  }
});

child.stderr.on('data', d => {
  console.log('ERR:', d.toString());
});

child.on('close', code => {
  console.log('Exit code:', code);
});

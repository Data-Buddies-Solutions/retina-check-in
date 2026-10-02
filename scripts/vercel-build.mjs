import { execFileSync } from 'node:child_process';
if (process.env.VERCEL_ENV === 'production') {
  execFileSync('npm', ['run', 'db:migrate'], { stdio: 'inherit' });
}
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });

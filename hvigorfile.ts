import { appTasks } from '@ohos/hvigor-ohos-plugin';
import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as http from 'http';

/**
 * 确保 fold-server 已启动（hvigor 加载时自动调用）。
 * 检测端口 8766 健康检查，未运行则以 detached 后台进程启动 scripts/fold-server.py。
 * 构建结束后进程继续存活，测试结束手动 Ctrl+C 或下次重启自动复用。
 */
function ensureFoldServer(): void {
  const PORT = 8766;
  const scriptPath = path.join(__dirname, 'scripts', 'fold-server.py');

  // 健康检查（Node http，不依赖 curl，跨平台）
  const isHealthy = (): boolean => {
    try {
      const result = execSync(
        `node -e "require('http').get('http://127.0.0.1:${PORT}/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"`,
        { stdio: 'ignore', timeout: 3000 }
      );
      return true;
    } catch {
      return false;
    }
  };

  // 已运行则跳过
  if (isHealthy()) {
    console.log('[fold-server] 已在运行，跳过自动启动');
    return;
  }

  // 脚本不存在则跳过（非测试场景）
  try {
    if (!require('fs').existsSync(scriptPath)) {
      return;
    }
  } catch {
    return;
  }

  // 以 detached 后台进程启动（构建结束后继续存活）
  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  const child = spawn(pythonBin, [scriptPath], {
    detached: true,
    stdio: 'ignore',
    cwd: __dirname
  });
  child.unref();
  console.log(`[fold-server] 后台启动中 (PID ${child.pid})...`);

  // 等待就绪（最多重试 10 次 × 1s）
  let retries = 10;
  const checkReady = (): void => {
    if (isHealthy()) {
      console.log('[fold-server] ✓ 已就绪，测试可直接调用 triggerFold');
      return;
    }
    if (retries-- > 0) {
      setTimeout(checkReady, 1000);
    } else {
      console.warn('[fold-server] ✗ 启动超时，请手动运行: python3 scripts/fold-server.py');
    }
  };
  setTimeout(checkReady, 1500);
}

// hvigor 加载时自动确保 fold-server 就绪
ensureFoldServer();

export default {
    system: appTasks,  /* Built-in plugin of Hvigor. It cannot be modified. */
    plugins:[]         /* Custom plugin to extend the functionality of Hvigor. */
}

import { makePause, noop } from '@/common';
import { addOwnCommands } from '@/background/utils/init';
import { initializeDatabase, parseScript } from '@/background/utils/db';
import storage from '@/background/utils/storage';

/*
 * 上游后台命令的补充，全部通过 addOwnCommands 追加，
 * 因此不需要改动任何上游文件。
 */
addOwnCommands({
  /** 从 storage 读取脚本代码再解析（Safari 消息通道不便直传大体量代码） */
  async ParseScriptFromStorage(data = {}) {
    const { codeKey, ...src } = data || {};
    if (!codeKey) throw 'Missing codeKey';
    let code;
    try {
      for (let i = 0; i < 8; i++) {
        const res = await storage.api.get([codeKey]);
        if (res && res[codeKey] != null) {
          code = res[codeKey];
          break;
        }
        await makePause(50);
      }
    } finally {
      await storage.api.remove([codeKey]).catch(noop);
    }
    if (code == null) throw 'Code not found';
    return parseScript({ ...src, code });
  },
  /** 重新读取 storage 并重建脚本索引 */
  RebuildScriptIndex() {
    return initializeDatabase(true);
  },
});

基于提供的文档，我来为您详细介绍如何使用 Walrus SDK (https://sdk.mystenlabs.com/walrus)：

## 1. 安装与初始化

### 安装依赖
```bash
npm install --save @mysten/walrus @mysten/sui
```

### 基本设置
```javascript
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { getFullnodeUrl } from '@mysten/sui/client';
import { walrus } from '@mysten/walrus';

const client = new SuiJsonRpcClient({
  url: getFullnodeUrl('testnet'),
  network: 'testnet', // 必须设置 network
}).$extend(walrus());
```

### 高级配置
可以自定义配置包 ID、存储节点客户端选项等：
```javascript
const client = new SuiJsonRpcClient({
  url: getFullnodeUrl('testnet'),
  network: 'testnet',
}).$extend(
  walrus({
    packageConfig: {
      systemObjectId: '0x98ebc47370603fe81d9e15491b2f1443d619d1dab720d586e429ed233e1255c1',
      stakingPoolId: '0x20266a17b4f1a216727f3eef5772f8d486a9e3b5e319af80a5b75809c035561d',
    },
    storageNodeClientOptions: {
      fetch: (url, options) => {
        console.log('fetching', url);
        return fetch(url, options);
      },
      timeout: 60_000,
    },
  }),
);
```

## 2. 核心功能

### 读取文件
使用 `WalrusFile` 高级抽象：
```javascript
// 批量读取文件（推荐）
const [file1, file2] = await client.walrus.getFiles({ 
  ids: [anyBlobId, orQuiltId] 
});

// 处理文件内容
const bytes = await file1.bytes();      // 获取 Uint8Array
const text = await file1.text();        // 解析为 UTF-8 字符串
const json = await file2.json();        // 解析为 JSON

// 获取元数据（如果存储在 quilt 中）
const identifier = await file1.getIdentifier();
const tags = await file1.getTags();
```

### 读取 Blob
直接读取 blob 数据：
```javascript
const blob = await client.walrus.readBlob({ blobId });
```

### 写入文件
```javascript
import { WalrusFile } from '@mysten/walrus';

// 创建文件
const file1 = WalrusFile.from({
  contents: new Uint8Array([1, 2, 3]),
  identifier: 'file1.bin',
});

const file2 = WalrusFile.from({
  contents: new TextEncoder().encode('Hello from the TS SDK!!!'),
  identifier: 'README.md',
  tags: {
    'content-type': 'text/plain',
  },
});

// 写入文件
const results = await client.walrus.writeFiles({
  files: [file1, file2],
  epochs: 3,          // 存储时长（epochs）
  deletable: true,    // 是否可删除
  signer: keypair,    // 签名者，需要有足够的 SUI 和 WAL 代币
});
```

### 浏览器环境优化
为避免浏览器阻止钱包弹窗，需要分步操作：
```javascript
// 步骤1：创建并编码文件流
const flow = client.walrus.writeFilesFlow({
  files: [WalrusFile.from({ contents: new Uint8Array(fileData), identifier: 'my-file.txt' })],
});
await flow.encode();

// 步骤2：注册 blob（用户点击按钮触发）
async function handleRegister() {
  const registerTx = flow.register({
    epochs: 3,
    owner: currentAccount.address,
    deletable: true,
  });
  const { digest } = await signAndExecuteTransaction({ transaction: registerTx });
  await flow.upload({ digest });
}

// 步骤3：认证 blob（用户点击另一个按钮触发）
async function handleCertify() {
  const certifyTx = flow.certify();
  await signAndExecuteTransaction({ transaction: certifyTx });
  const files = await flow.listFiles();
  console.log('Uploaded files', files);
}
```

## 3. 高级功能

### 使用上传中继
减少客户端请求量，提高效率：
```javascript
const client = new SuiJsonRpcClient({
  url: getFullnodeUrl('testnet'),
  network: 'testnet',
}).$extend(
  walrus({
    uploadRelay: {
      host: 'https://upload-relay.testnet.walrus.space',
      sendTip: {
        max: 1_000, // 最大小费（MIST）
      },
    },
  }),
);
```

支持两种小费模式：
- **固定小费**：`kind: { const: 105 }`
- **线性小费**：`kind: { linear: { base: 105, perEncodedKib: 10 } }`

### 直接操作 Blobs
```javascript
// 写入 blob
const file = new TextEncoder().encode('Hello from the TS SDK!!!');
const { blobId } = await client.walrus.writeBlob({
  blob: file,
  deletable: false,
  epochs: 3,
  signer: keypair,
});

// 读取 blob
const blobContent = await client.walrus.readBlob({ blobId });
```

## 4. 环境配置

### Vite 配置
```javascript
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url';

const client = new SuiJsonRpcClient({
  url: getFullnodeUrl('testnet'),
  network: 'testnet',
}).$extend(
  walrus({
    wasmUrl: walrusWasmUrl,
  }),
);
```

### Next.js 配置
```javascript
// next.config.ts
const nextConfig = {
  serverExternalPackages: ['@mysten/walrus', '@mysten/walrus-wasm'],
};
```

## 5. 错误处理

```javascript
import { RetryableWalrusClientError } from '@mysten/walrus';

try {
  // 操作代码
} catch (error) {
  if (error instanceof RetryableWalrusClientError) {
    client.walrus.reset(); // 重置客户端
    // 重试操作
  }
}

// 调试网络错误
const client = new SuiJsonRpcClient({
  url: getFullnodeUrl('testnet'),
  network: 'testnet',
}).$extend(
  walrus({
    storageNodeClientOptions: {
      onError: (error) => console.log(error), // 记录单个请求错误
    },
  }),
);
```

## 6. 重要注意事项

1. **成本考虑**：
   - 写入 blob 需要支付 SUI 交易费和 WAL 存储费
   - 费用取决于 blob 大小、gas 价格和存储价格

2. **性能特点**：
   - 直接读写 blob 需要大量请求（写入约 2200 次，读取约 335 次）
   - 使用上传中继可以减少写入请求量
   - 批量处理文件比单个文件更高效

3. **存储结构**：
   - 当前 SDK 会将多个文件写入单个 quilt
   - 单个文件的 quilt 编码效率较低，建议批量写入

4. **网络要求**：
   - 需要处理节点响应慢的情况
   - 在 Node.js 环境中默认连接超时为 10 秒
   - 在 Bun 环境中 abort 信号的行为特殊

## 7. 资源

- **完整 API 文档**：参考 TypeDocs
- **示例代码**：查看 `ts-sdks` 仓库中的示例
- **错误类**：SDK 导出了所有错误类，便于精确错误处理

这个 SDK 适合需要直接与 Walrus 存储交互的应用程序，特别是当用户需要直接支付存储费用的场景。对于大多数应用，建议考虑使用发布者和聚合器模式来优化性能。
# Session Authorization Guide

## `authorizeSession()` 触发场景与集成指南

### 现状分析 (Current Status)

**⚠️ 重要发现**:
- ✅ `SessionContext.authorizeSession()` 已完整实现
- ❌ **前端组件中尚未集成调用**
- ❌ 用户目前无法通过UI触发session授权

---

## 推荐的触发场景 (Recommended Trigger Scenarios)

### 1. **首次使用时主动授权** (First-time Proactive Authorization)

**场景**: 用户首次创建notebook后，自动提示授权session

**实现位置**: `App.tsx` 或 `Onboarding.tsx`

```typescript
// App.tsx (在notebook创建成功后)
useEffect(() => {
    const autoAuthorizeSession = async () => {
        if (notebook?.data?.objectId && !isSessionValid && !isLoading) {
            try {
                console.log('[App] Auto-authorizing session for new notebook...');
                await authorizeSession(notebook.data.objectId);
            } catch (error) {
                console.error('[App] Auto-authorization failed:', error);
                // 可选: 显示错误提示，但不阻塞用户继续使用
            }
        }
    };

    autoAuthorizeSession();
}, [notebook, isSessionValid]);
```

**优点**:
- ✅ 无缝用户体验 (用户无需手动操作)
- ✅ 首次使用即可享受gas-free体验
- ✅ 减少交易签名次数

**缺点**:
- ⚠️ 需要用户签名2次 (授权signature + 加密signature)
- ⚠️ 需要用户有WAL代币

---

### 2. **首次保存note时按需授权** (On-demand Authorization on First Save)

**场景**: 用户首次保存note时检测到无session，提示授权

**实现位置**: `App.tsx` 的 `handleSaveNote()`

```typescript
const handleSaveNote = async (id: string) => {
    if (!notebook?.data?.objectId || !encryptionKey) return;

    const note = notes.find(n => n.id === id);
    if (!note) return;

    try {
        // 检查session状态
        if (!isSessionValid) {
            console.log('[App] No valid session, prompting authorization...');

            // 提示用户授权session (可选: 显示modal说明好处)
            const userConfirmed = window.confirm(
                'Enable frictionless note saving?\n\n' +
                'This will create a session key for this device, allowing you to save notes without signing every transaction.\n\n' +
                'You will need to sign twice now, but future saves will be automatic.'
            );

            if (userConfirmed) {
                await authorizeSession(notebook.data.objectId);
            }
        }

        // 继续保存note...
        const result = await walrusService.uploadInkBlobContent(note.content, encryptionKey);
        // ...
    } catch (error) {
        console.error('[App] Failed to save note:', error);
        alert('Failed to save note');
    }
};
```

**优点**:
- ✅ 用户明确知道为什么需要授权
- ✅ 可选择是否启用 (用户控制)
- ✅ 不阻塞首次使用流程

**缺点**:
- ⚠️ 首次保存会中断 (需要重新保存)
- ⚠️ 用户可能拒绝授权 (降级到逐次签名)

---

### 3. **设置页面手动授权** (Manual Authorization in Settings)

**场景**: 用户在设置页面主动启用/禁用session

**实现位置**: 新建 `SettingsPage.tsx` 或在现有设置中添加

```typescript
const SettingsPage: React.FC = () => {
    const { isSessionValid, sessionExpiresAt, hotWalletAddress, authorizeSession, revokeSession, isLoading, error } = useSession();
    const { data: notebook } = useNotebook();

    const handleEnableSession = async () => {
        if (!notebook?.data?.objectId) {
            alert('Please create a notebook first');
            return;
        }

        try {
            await authorizeSession(notebook.data.objectId);
            alert('Session authorized successfully!');
        } catch (error: any) {
            alert(`Failed to authorize session: ${error.message}`);
        }
    };

    return (
        <div className="settings-page">
            <h2>Session Management</h2>

            {isSessionValid ? (
                <div className="session-active">
                    <p>✅ Session Active</p>
                    <p>Hot Wallet: {hotWalletAddress}</p>
                    <p>Expires: {new Date(sessionExpiresAt!).toLocaleString()}</p>
                    <button onClick={revokeSession}>Revoke Session</button>
                </div>
            ) : (
                <div className="session-inactive">
                    <p>❌ No Active Session</p>
                    <p>Enable session for frictionless note saving (no signing required)</p>
                    <button onClick={handleEnableSession} disabled={isLoading}>
                        {isLoading ? 'Authorizing...' : 'Enable Session'}
                    </button>
                </div>
            )}

            {error && <div className="error">{error}</div>}
        </div>
    );
};
```

**优点**:
- ✅ 用户完全控制
- ✅ 清晰的状态显示
- ✅ 可随时撤销

**缺点**:
- ⚠️ 需要用户主动发现和启用
- ⚠️ 新用户可能不理解session的好处

---

### 4. **Session过期后自动提示刷新** (Auto-prompt for Refresh on Expiration)

**场景**: Session即将过期时,自动提示用户刷新

**实现位置**: `SessionContext.tsx` 的 expiration监控

```typescript
// SessionContext.tsx (已实现监控,需要添加UI提示)
useEffect(() => {
    if (!sessionExpiresAt) return;

    const checkExpiration = () => {
        const timeUntilExpiration = sessionExpiresAt - Date.now();

        if (timeUntilExpiration <= 0) {
            console.warn('[SessionContext] Session expired, clearing...');
            revokeSession();

            // 🆕 添加UI提示
            if (window.confirm('Your session has expired. Refresh now to continue gas-free saving?')) {
                refreshSession();
            }
        } else if (timeUntilExpiration <= EXPIRATION_WARNING_THRESHOLD) {
            console.warn('[SessionContext] Session expiring soon:', new Date(sessionExpiresAt).toISOString());

            // 🆕 添加UI警告
            // TODO: 使用toast通知替代alert
            if (window.confirm('Your session will expire in 1 hour. Refresh now?')) {
                refreshSession();
            }
        }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 60 * 1000);
    return () => clearInterval(interval);
}, [sessionExpiresAt]);
```

---

## 最佳实践推荐 (Best Practice Recommendation)

### 组合方案: **自动授权 + 设置页面管理**

```typescript
// 1. App.tsx - 首次使用时静默尝试授权
useEffect(() => {
    const tryAutoAuthorize = async () => {
        if (notebook?.data?.objectId && !isSessionValid && !sessionError) {
            try {
                console.log('[App] Attempting auto-authorization...');
                await authorizeSession(notebook.data.objectId);
            } catch (error: any) {
                console.log('[App] Auto-authorization skipped:', error.message);
                // 静默失败,用户可通过设置页面手动启用
                if (error.message.includes('WAL')) {
                    // 特殊处理: 显示获取WAL的提示
                    setWalTokenWarning(true);
                }
            }
        }
    };

    tryAutoAuthorize();
}, [notebook, isSessionValid]);

// 2. Settings页面 - 提供手动控制
// (见上面的SettingsPage实现)

// 3. handleSaveNote - 降级处理
const handleSaveNote = async (id: string) => {
    // ...
    if (isSessionValid && ephemeralKeypair) {
        // 使用hot wallet (gas-free)
        await suiService.executeWithSession(tx, ephemeralKeypair);
    } else {
        // 降级到主钱包签名
        await signAndExecuteTransaction({ transaction: tx });
    }
};
```

---

## 错误处理与用户体验 (Error Handling & UX)

### WAL Token缺失
```typescript
{error?.includes('WAL') && (
    <div className="wal-token-warning">
        <p>⚠️ No WAL tokens found</p>
        <p>Get WAL tokens to enable session:</p>
        <a href="https://faucet.testnet.walrus.space" target="_blank">
            WAL Testnet Faucet →
        </a>
    </div>
)}
```

### 签名拒绝
```typescript
catch (error: any) {
    if (error.message.includes('User rejected')) {
        console.log('[App] User declined session authorization');
        // 不显示错误,允许继续使用主钱包模式
    } else {
        alert(`Session authorization failed: ${error.message}`);
    }
}
```

### 过期提醒 (使用Toast替代Alert)
```typescript
// 推荐使用 react-toastify 或类似库
import { toast } from 'react-toastify';

if (timeUntilExpiration <= EXPIRATION_WARNING_THRESHOLD) {
    toast.warning(
        'Session expiring soon. Click to refresh.',
        {
            onClick: () => refreshSession(),
            autoClose: false,
        }
    );
}
```

---

## 安全注意事项 (Security Considerations)

1. **✅ 已实现**: CRYPTO-4 - 分离的加密签名
2. **✅ 已实现**: P0 - SHA-256设备指纹
3. **✅ 已实现**: P1 - HKDF上下文分离
4. **⚠️ 待实现**: UI明确说明hot wallet的用途和风险
5. **⚠️ 待实现**: 提供清晰的撤销路径

---

## 实现优先级 (Implementation Priority)

| 优先级 | 场景 | 工作量 | 用户影响 |
|--------|------|--------|----------|
| **P0** | 首次使用时自动授权 | 1小时 | ✅ 最佳体验 |
| **P1** | 设置页面手动控制 | 2小时 | ✅ 用户控制 |
| **P2** | 过期自动提示 | 1小时 | ✅ 防止中断 |
| **P3** | 首次保存时提示 | 0.5小时 | ⚠️ 可选 |

---

## 下一步行动 (Next Steps)

1. **立即**: 在`App.tsx`添加自动授权逻辑
2. **本周**: 创建Settings页面,添加session管理UI
3. **下周**: 添加过期提醒的Toast通知
4. **未来**: 优化用户引导流程 (教程/tooltips)

---

**文档状态**: 待实施
**最后更新**: 2025-11-24
**版本**: 1.0

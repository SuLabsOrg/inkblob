基于 Sui 和 Walrus 构建下一代去中心化笔记应用：架构深度解析与实现指南1. 执行摘要与架构愿景随着 Web3 技术的成熟，数据主权（Data Sovereignty）已从理论探讨走向实际应用。传统的云笔记服务（如 Apple Notes 或 Evernote）虽然提供了卓越的用户体验，但其中心化的架构使得用户数据面临审查、隐私泄露和服务中断的风险。本报告旨在详细阐述如何利用 Sui 区块链的高性能对象模型与 Walrus 协议的去中心化存储能力，构建一个在体验上媲美 Web2 原生应用，但在架构上完全去中心化、抗审查且具备端到端加密特性的笔记 DApp。本方案的核心创新在于状态与存储的解耦以及加密权能的委托机制。通过利用 Sui 的对象中心化模型（Object-Centric Model），我们将笔记的元数据、访问控制列表（ACL）和版本历史存储在链上，利用 Sui 的亚秒级最终确定性实现多设备间的即时状态同步 1。而笔记的实际内容（富文本、图片、附件）则经过客户端加密后，存储在基于纠删码（Erasure Coding）技术的 Walrus 协议中，从而大幅降低存储成本并确保持久性 1。针对用户体验中最大的痛点——频繁的钱包签名确认，本报告提出并实现了一种基于 “临时会话密钥”（Ephemeral Session Keys） 的热钱包模式。通过智能合约中的权能（Capability）委托设计，用户只需在设备首次登录时进行一次主钱包签名授权，后续的笔记保存、修改操作均由本地生成的临时密钥自动完成签名，实现了“免打扰”的流畅体验，同时确保了主私钥的安全隔离 4。2. 系统架构与技术栈选择为了满足“多设备同步”、“热钱包免签名”和“加密存储”这三大核心需求，系统被设计为三层架构：客户端加密层、Sui 状态控制层和 Walrus 数据持久层。2.1 控制层：Sui 区块链的对象模型优势在以太坊等传统 EVM 链上，状态通常存储在单一合约的大型映射（Mapping）中，这在并发处理和状态索引上存在瓶颈。Sui 采用了独特的对象模型，其中每一个“笔记本”（Notebook）或“笔记”（Note）都是一个独立的链上对象，拥有全局唯一的 ID（UID）7。共享对象（Shared Objects）与同步： 为了支持多设备同步，核心的 Notebook 对象被设计为共享对象。这意味着它不属于单一地址，而是可以被任何持有特定“写入权能”（WriteCapability）的地址修改。这种设计允许用户的主钱包、手机端的热钱包地址以及桌面端的会话密钥同时对同一个笔记本对象进行操作，从而天然实现了多端数据的一致性 9。权能设计模式（Capability Pattern）： Sui Move 的安全性高度依赖于权能模式。我们定义一个 SessionCap 对象，它代表了“在特定时间窗口内修改特定笔记本”的权限。主钱包可以铸造这个对象并将其转移给浏览器的临时钱包，从而通过链上逻辑严格限制热钱包的权限范围 12。2.2 存储层：Walrus 协议的集成Walrus 是专为 Sui 生态设计的去中心化存储网络。与 IPFS 依赖内容寻址但缺乏内置激励层不同，Walrus 通过 $WAL 代币和 Sui 链上的存储资源证明机制，确保了数据的长期持有。Blob ID 与元数据关联： 当客户端将加密后的笔记上传至 Walrus 后，会获得一个 Blob ID。这个 ID 是 32 字节的哈希引用。我们将这个 ID 存储在 Sui 的 Notebook 对象中。这种“链上存指针，链下存数据”的模式是目前 Web3 应用的最优解 1。RedStuff 编码： Walrus 使用了一种名为 RedStuff 的二维纠删码算法。这意味着数据被切片并分散存储在多个节点上。即使高达三分之二的存储节点离线，数据依然可以被重建。对于笔记应用而言，这意味着极高的数据可靠性，且存储成本远低于在区块链全节点上复制数据 3。上传中继（Upload Relay）： 考虑到浏览器环境无法直接与数百个存储节点建立高并发连接，我们的架构中包含一个轻量级的 Upload Relay。前端将加密数据发送给 Relay，由 Relay 负责分发切片并收集存储凭证（Certificate），最后返回 Blob ID 16。2.3 客户端层：零知识架构前端应用采用“零知识”（Zero-Knowledge）原则设计，即服务器（Sui 节点、Walrus 节点、Relay）永远无法获知笔记的明文内容。确定性密钥派生： 为了让用户在不同设备上都能解密数据，且无需记忆额外的密码，我们利用用户钱包对特定消息的签名作为熵源（Entropy Source），通过密钥派生函数（KDF）生成对称加密密钥。这确保了只要用户持有钱包私钥，就能在任何设备上恢复数据 18。本地状态管理： React 前端利用 TanStack Query 或类似库来管理从 Sui RPC 获取的链上状态，并与本地的加密密钥结合，实时渲染 UI。3. 密码学安全模型与密钥派生机制在去中心化应用中，安全性完全依赖于密码学原语的正确组合。本系统的安全核心在于如何安全地从签名中派生加密密钥，以及如何管理热钱包的授权。3.1 基于签名的确定性密钥派生 (Deterministic Key Derivation)为了实现“由钱包加密”且支持多设备，我们需要一个既不仅依赖本地存储，又能确定性生成的加密密钥。3.1.1 派生流程用户认证： 用户连接 Sui 钱包（如 Suiet, Martian）。请求签名（Personal Sign）： 应用请求用户对一段固定的、应用特定的字符串进行签名。例如："Sign this message to unlock your Walrus Notes. nonce: v1"。获取熵源： 钱包使用 Ed25519 或 Secp256k1 私钥对该消息进行签名，生成 64 字节的签名数据。由于私钥和消息都是固定的，生成的签名也是确定性的（Deterministic）4。密钥拉伸（Key Stretching）： 直接使用签名作为 AES 密钥是不安全的，因为签名的数学结构可能暴露信息。我们使用 HKDF (HMAC-based Extract-and-Expand Key Derivation Function) 对签名进行处理。Salt (盐): 硬编码在应用中的随机字符串，用于隔离不同应用的密钥空间。Info: 上下文信息，如 "WalrusNotes_Encryption_Key_v1"。Output: 生成 256-bit (32 bytes) 的高强度密钥，用于 AES-GCM 20。3.1.2 代码实现逻辑 (TypeScript)TypeScript// 伪代码展示核心逻辑
const message = new TextEncoder().encode("Authorize Walrus Notes Access");
const { signature } = await wallet.signPersonalMessage({ message });

// 使用 Web Crypto API 进行 HKDF 处理
const keyMaterial = await window.crypto.subtle.importKey(
  "raw", 
  Uint8Array.from(atob(signature), c => c.charCodeAt(0)), 
  "HKDF", 
  false, 
  ["deriveKey"]
);

const encryptionKey = await window.crypto.subtle.deriveKey(
  {
    name: "HKDF",
    salt: new TextEncoder().encode("Sui_Walrus_Notes_Salt_v1"),
    info: new TextEncoder().encode("AES-GCM-256"),
    hash: "SHA-256"
  },
  keyMaterial,
  { name: "AES-GCM", length: 256 },
  false, 
  ["encrypt", "decrypt"]
);
引用来源: 43.2 数据加密标准 (AES-GCM)我们选用 AES-256-GCM 算法。GCM 模式不仅提供机密性（Confidentiality），还提供完整性（Integrity）。这意味着如果 Walrus 上的数据被篡改（位翻转或恶意修改），解密过程会直接抛出错误，而不是输出乱码，这对于防范恶意节点至关重要 20。IV (初始化向量) 管理： 每次保存笔记时，都会生成一个新的 12 字节随机 IV。这个 IV 不需要加密，它会明文存储在 Walrus 的 Blob 数据头中，或者存储在 Sui 的对象元数据中。重用 IV 会导致 GCM 模式的安全性彻底崩溃，因此必须确保每次写入都使用新的随机值 23。4. Sui Move 智能合约架构设计智能合约是整个系统的控制中枢，负责权限管理和元数据索引。4.1 核心模块设计：notebook我们需要定义两个核心对象：Notebook（存储笔记列表）和 SessionCap（会话权限凭证）。4.1.1 数据结构Notebook (Shared Object): 这是一个共享对象，包含一个 vector<Note> 或 Table<ID, Note>。它记录了所有笔记的 Blob ID 和加密标题。由于是共享对象，多个拥有 SessionCap 的用户/设备可以并发地对其发起交易 9。SessionCap (Owned Object): 这是一个具有 key 和 store 能力的对象。主钱包创建此对象并将其转移给热钱包地址。合约在执行更新操作时，会检查调用者是否拥有一个指向目标 Notebook 的有效 SessionCap 13。4.1.2 Move 合约代码实现以下是完整的 Move 模块代码，实现了基于 Capability 的访问控制逻辑：代码段module walrus_notes::notebook {
    use std::string::{Self, String};
    use std::vector;
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::{Self, Clock};
    use sui::event;

    // --- 错误码定义 ---
    const ENotOwner: u64 = 0;
    const EInvalidCap: u64 = 1;
    const ESessionExpired: u64 = 2;

    // --- 核心结构体 ---

    /// 笔记本对象：存储所有笔记的元数据。
    /// 被设计为共享对象(Shared Object)，以便多端并发访问。
    struct Notebook has key, store {
        id: UID,
        /// 笔记本的原始拥有者（主钱包地址）
        owner: address,
        /// 笔记列表，存储简要元数据
        notes: vector<Note>,
    }

    /// 单条笔记的元数据（内容在 Walrus 上）
    struct Note has store, copy, drop {
        id: ID, 
        /// Walrus 返回的 Blob ID
        blob_id: String,
        /// 加密后的标题，用于前端列表展示
        encrypted_title: String,
        /// 更新时间戳
        updated_at: u64,
        /// 逻辑删除标记
        is_deleted: bool,
    }

    /// 会话权能：允许持有者（热钱包）修改特定的笔记本
    struct SessionCap has key, store {
        id: UID,
        /// 该权能绑定的笔记本 ID
        for_notebook: ID,
        /// 权能的过期时间戳 (毫秒)
        expires_at: u64,
    }

    // --- 事件定义 ---
    struct NoteUpdated has copy, drop {
        notebook_id: ID,
        blob_id: String,
        operator: address
    }

    // --- 入口函数 (Entry Functions) ---

    /// 1. 创建笔记本
    /// 由用户主钱包调用。创建后自动共享。
    public entry fun create_notebook(ctx: &mut TxContext) {
        let uid = object::new(ctx);
        let notebook = Notebook {
            id: uid,
            owner: tx_context::sender(ctx),
            notes: vector::empty(),
        };
        // 将笔记本共享，使其成为 Shared Object
        transfer::share_object(notebook);
    }

    /// 2. 授权设备（创建会话）
    /// 只有 Notebook 的 owner 可以调用。
    /// 将 SessionCap 发送给 ephemeral_addr (热钱包地址)。
    public entry fun authorize_session(
        notebook: &Notebook,
        ephemeral_addr: address,
        duration_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // 鉴权：只有主钱包拥有者可以授权新设备
        assert!(notebook.owner == tx_context::sender(ctx), ENotOwner);

        let cap = SessionCap {
            id: object::new(ctx),
            for_notebook: object::id(notebook),
            expires_at: sui::clock::timestamp_ms(clock) + duration_ms
        };

        // 将权能转移给热钱包地址
        transfer::public_transfer(cap, ephemeral_addr);
    }

    /// 3. 添加或更新笔记
    /// 调用者需要拥有对应的 SessionCap。
    public entry fun update_note(
        notebook: &mut Notebook,
        cap: &SessionCap, // 必须传入权能对象引用
        blob_id: String,
        encrypted_title: String,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // 验证权能有效性
        assert!(cap.for_notebook == object::id(notebook), EInvalidCap);
        assert!(sui::clock::timestamp_ms(clock) < cap.expires_at, ESessionExpired);

        // 创建新笔记元数据
        // 在实际生产中，可能需要根据 ID 查找并替换旧笔记，这里简化为追加模式
        let note = Note {
            id: object::new(ctx).to_id(),
            blob_id,
            encrypted_title,
            updated_at: sui::clock::timestamp_ms(clock),
            is_deleted: false
        };

        vector::push_back(&mut notebook.notes, note);
        
        event::emit(NoteUpdated { 
            notebook_id: object::id(notebook), 
            blob_id,
            operator: tx_context::sender(ctx)
        });
    }

    /// 4. 吊销会话
    /// 销毁 SessionCap 对象
    public entry fun revoke_session(cap: SessionCap) {
        let SessionCap { id, for_notebook: _, expires_at: _ } = cap;
        object::delete(id);
    }
}
设计解析：transfer::share_object: 使用共享对象至关重要。如果是 Owned Object，只有 Owner 才能发起交易。通过共享，任何地址都可以发起涉及该对象的交易，但我们在逻辑中通过 cap: &SessionCap 强制要求交易发起者必须证明自己拥有授权 25。SessionCap: 这是一个典型的 Capability Pattern 应用。它包含过期时间，模拟了 Web2 中的 Session Cookie。当热钱包的 SessionCap 过期时，Move 合约会拒绝交易，前端将提示用户重新用主钱包授权 12。5. Walrus 存储层实现细节Walrus 不仅是一个存储桶，它是基于 Sui 的可编程存储层。5.1 Blob 生命周期与成本编码 (Encoding): 客户端将加密后的笔记数据（Uint8Array）发送给 Walrus Relay。切片与分发: Relay 将数据通过 RedStuff 编码生成切片，并分发给存储节点网络。认证 (Certification): 存储节点确认接收后，聚合生成一个“可用性证书”（Availability Certificate）。上链 (Transaction): 这一步至关重要。Walrus 要求在 Sui 链上发布一个交易来“注册”这个 Blob。这个交易支付了存储费（$WAL 代币，或在测试网使用测试代币）。在我们的设计中，这个动作由 Relay 或前端的热钱包完成 1。5.2 浏览器端上传实现由于浏览器的安全限制（CORS 和连接数限制），前端不应直接连接存储节点，而应通过聚合器（Aggregator）或中继（Relay）。Walrus SDK 集成示例：TypeScriptimport { WalrusClient } from '@mysten/walrus';

// 初始化客户端，指向聚合器和中继
const walrusClient = new WalrusClient({
    network: 'testnet',
    uploadRelay: { 
        host: 'https://upload-relay.testnet.walrus.space' 
    }
});

/**
 * 上传加密数据到 Walrus
 * @param encryptedData 加密后的 Uint8Array
 * @param epochs 存储周期 (Epochs)
 * @param signer 热钱包的 Keypair
 */
async function uploadToWalrus(encryptedData: Uint8Array, signer: any) {
    // Walrus SDK 的 writeBlob 会自动处理：
    // 1. 编码
    // 2. 发送给 Relay
    // 3. 构造 Sui 交易进行 Blob 认证
    // 4. 使用 signer 签名该交易
    const { blobId, blobObject } = await walrusClient.writeBlob({
        blob: encryptedData,
        deletable: true, // 允许删除以回收部分存储费
        epochs: 10,      // 指定存储时长
        signer: signer   // 使用热钱包进行签名，无需用户弹窗
    });

    console.log(`Upload Success. Blob ID: ${blobId}`);
    return blobId;
}
引用来源: 166. 前端实现与“热钱包”免签名体验 (React)这是用户感知的核心部分。我们将使用 React 结合 @mysten/dapp-kit 和本地存储来实现无缝体验。6.1 核心流程状态图未登录状态: 用户点击 "Connect Wallet" 连接主钱包（如 Suiet）。初始化:检查本地 localStorage 是否有加密的临时私钥。如果没有，生成新的 Ed25519Keypair。弹出主钱包签名请求：1. 签名用于派生 AES 密钥；2. 签名交易调用 authorize_session 给临时地址授权。登录状态 (热钱包模式):用户编辑笔记，点击保存。前端使用内存中的 AES 密钥加密内容。前端使用内存中的 Ed25519Keypair (临时密钥) 自动签署 Walrus 上传交易和 Sui 更新交易。全程无弹窗。6.2 关键 React Hooks 实现6.2.1 临时密钥管理器 (useEphemeralKey)TypeScriptimport { useState, useEffect } from 'react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export function useEphemeralKey() {
    const [ephemeralKeypair, setEphemeralKeypair] = useState<Ed25519Keypair | null>(null);

    useEffect(() => {
        // 尝试从本地存储恢复
        const storedKey = localStorage.getItem('walrus_notes_ephemeral_sk');
        if (storedKey) {
            const keypair = Ed25519Keypair.fromSecretKey(
                new Uint8Array(JSON.parse(storedKey))
            );
            setEphemeralKeypair(keypair);
        } else {
            // 生成新密钥对
            const newKeypair = new Ed25519Keypair();
            // 实际生产中，这里应该用派生的主密钥加密存储，而非明文
            localStorage.setItem(
                'walrus_notes_ephemeral_sk', 
                JSON.stringify(Array.from(newKeypair.getSecretKey()))
            );
            setEphemeralKeypair(newKeypair);
        }
    },);

    return ephemeralKeypair;
}
引用来源: 276.2.2 加密与数据同步逻辑 (App.tsx)TypeScriptimport React, { useState } from 'react';
import { useCurrentAccount, useSignPersonalMessage, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { useEphemeralKey } from './hooks/useEphemeralKey';
// 假设已导入上述辅助函数

const NOTEBOOK_ID = "0x..."; // 用户的笔记本对象 ID (从链上查询获取)
const PACKAGE_ID = "0x..."; 

export default function NotesApp() {
    const account = useCurrentAccount();
    const { mutateAsync: signMessage } = useSignPersonalMessage();
    const { mutateAsync: executeTx } = useSignAndExecuteTransaction(); // 主钱包调用
    const ephemeralKey = useEphemeralKey();
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

    // 1. 初始化：授权热钱包 & 派生加密密钥
    const handleSetup = async () => {
        if (!account ||!ephemeralKey) return;

        // A. 派生加密密钥
        const msg = new TextEncoder().encode("Authorize Walrus Notes Encryption");
        const { signature } = await signMessage({ message: msg });
        const key = await deriveAesKeyFromSignature(signature); // 见 3.1.2 实现
        setEncryptionKey(key);

        // B. 链上授权 (Mint SessionCap)
        const tx = new Transaction();
        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::authorize_session`,
            arguments:
        });
        await executeTx({ transaction: tx });
        alert("Setup Complete! You can now write notes without popups.");
    };

    // 2. 保存笔记 (热钱包操作)
    const handleSaveNote = async (content: string) => {
        if (!encryptionKey ||!ephemeralKey) return;

        // A. 加密
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            encryptionKey,
            new TextEncoder().encode(content)
        );
        
        // B. 上传到 Walrus (使用临时密钥签名)
        // 注意: 上传需要支付少量 WAL/SUI，确保临时地址有少量 Gas 或使用 Sponsored Transaction
        const blobId = await uploadToWalrus(new Uint8Array(encrypted), ephemeralKey);

        // C. 更新 Sui 状态 (使用临时密钥签名)
        const tx = new Transaction();
        // 这一步需要查询当前持有的 SessionCap ID
        const sessionCapId = await fetchSessionCapId(ephemeralKey.toSuiAddress()); 
        
        tx.moveCall({
            target: `${PACKAGE_ID}::notebook::update_note`,
            arguments:
        });

        // 关键：使用 ephemeralKey 直接构建 Client 执行交易，绕过钱包插件
        const suiClient = new SuiClient({ url: 'https://fullnode.testnet.sui.io' });
        const result = await suiClient.signAndExecuteTransaction({
            transaction: tx,
            signer: ephemeralKey, 
        });
        
        console.log("Note Saved:", result.digest);
    };

    return (
        <div>
            {!encryptionKey? (
                <button onClick={handleSetup}>Initialize Session</button>
            ) : (
                <button onClick={() => handleSaveNote("My Secret Note")}>Save Note</button>
            )}
        </div>
    );
}
引用来源: 286.3 解决 Gas 费问题在上述代码中，热钱包 ephemeralKey 需要支付 Gas 费。为了极致体验，我们有三种方案：用户转账： 在授权阶段，主钱包顺便转 1 SUI 给热钱包。赞助交易 (Sponsored Transactions)： 后端服务作为 Gas Station，为热钱包的特定交易付费。这是 Sui 的原生功能，最适合商业应用 5。Walrus 支付： Walrus 操作本身可能需要 $WAL 代币，这通常也需要通过赞助或 Swap 获取。本报告推荐 赞助交易 模式，但这需要额外部署一个后端签名服务。为简化演示，我们假设用户在 Setup 阶段向热钱包发送了少量测试币。7. 性能优化、数据同步与冲突解决7.1 多设备同步逻辑当用户在手机端打开 App 时：查询链上状态： 前端通过 suiClient.getObject({ id: NOTEBOOK_ID, options: { showContent: true } }) 获取最新的 Notebook 数据。获取笔记列表： 解析 notes 字段，得到所有笔记的 blob_id 和 updated_at。Walrus 获取： 根据 blob_id 并发请求 Walrus Aggregator 读取加密内容。本地解密： 使用手机端派生出的 AES 密钥解密并展示。由于 Notebook 是共享对象，Sui 保证了其数据的因果顺序。7.2 冲突解决 (Conflict Resolution)当两个设备同时离线编辑同一条笔记并随后上线时，会发生冲突。最后写入者胜 (Last-Write-Wins, LWW): 在智能合约中，我们记录了 updated_at。简单的策略是保留时间戳较新的版本。历史版本保留： 更高级的策略是，update_note 不覆盖旧笔记，而是向 vector 追加新条目。前端可以拉取该笔记 ID 的所有历史版本，让用户手动合并或查看历史。本架构采用追加模式，天然支持历史回溯。7.3 性能指标延迟： Walrus 上传通常在 1-2 秒内完成（依赖于文件大小和网络）。Sui 的共识确权约为 400ms-600ms。整体保存体验在 3 秒以内，接近 Web2 体验。成本： 在 Walrus 上存储 1GB 数据的成本远低于以太坊或 Solana 的链上存储。Sui 的 Gas 费通常低于 0.001 SUI。8. 结论本报告详细展示了如何基于 Sui 和 Walrus 构建一个具备商业级可用性的去中心化笔记应用。通过对象模型（Object Model） 管理状态，我们实现了高效的并发控制；通过 Walrus，我们解决了 Web3 的存储成本难题；通过 权能（Capability） 和 临时密钥（Ephemeral Keys），我们成功消除了 Web3 应用最大的体验障碍——频繁签名。这一架构不仅适用于笔记应用，更为去中心化邮件、文档协作、甚至去中心化社交网络（SocialFi）提供了标准化的参考范式。随着 Sui 生态中 zkLogin 等技术的进一步普及，未来甚至可以省去“连接钱包”的步骤，直接使用 Google 账号登录即可无感获得 Web3 的安全保障。附录：参考资料映射Sui Object Model & Ownership: 2Walrus Protocol & RedStuff: 1Session Keys & Cryptography: 4Move Smart Contracts: 12Frontend Integration: 16
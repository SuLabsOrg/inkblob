# InkBlob Product Requirements Document (PRD)

## 1. Product Vision
InkBlob aims to be the **"Decentralized Notion"**—a powerful, block-based note-taking application that combines the fluid user experience of modern productivity tools with the uncompromising security and ownership of Web3.

**Tagline:** Your thoughts, your keys, your cloud.

## 2. Core Value Propositions

### 2.1 Notion-Like User Experience
We refuse to compromise on UX. Using a decentralized app shouldn't feel like a downgrade.
- **Slash Commands**: Instant access to formatting and blocks via `/`.
- **Block-Based Editing**: Every paragraph, heading, and list item is a block that can be manipulated.
- **Rich Media & Tables**: Support for dynamic content like tables, code blocks, and eventually images.
- **Polished UI**: A minimalist, distraction-free interface with a premium feel (glassmorphism, smooth animations).

### 2.2 Uncompromising Decentralization & Privacy
- **True Ownership**: Content is stored on Walrus (decentralized storage), not AWS. Metadata lives on Sui (blockchain).
- **Client-Side Encryption**: All data is encrypted *before* it leaves the browser. We (the developers) cannot read your notes.
- **Censorship Resistant**: No central authority can delete your data or block your access.

## 3. Target Audience
- **Web3 Natives**: Users who value data sovereignty and are already comfortable with wallets.
- **Privacy Advocates**: Journalists, researchers, and individuals who need guaranteed privacy.
- **Productivity Enthusiasts**: Users looking for a Notion alternative that isn't a walled garden.

## 4. Key Features (MVP)

### 4.1 The Editor
- **Rich Text**: Bold, Italic, Underline, Strikethrough.
- **Structure**: H1-H3, Bullet/Numbered Lists, Quotes.
- **Code**: Syntax highlighting for snippets.
- **Slash Menu**: intuitive block creation (`/table`, `/h1`, etc.).
- **Tables**: Dynamic insertion with grid selector.

### 4.2 Workspace Management
- **Hierarchical Folders**: Organize notes in nested folders.
- **Sidebar Navigation**: Quick access to all content.
- **Multi-Device Sync**: Access notes from any device with your wallet.

### 4.3 Security & Infrastructure
- **Sui Blockchain**: Handles access control, metadata, and sharing permissions.
- **Walrus Protocol**: Stores the actual encrypted content blobs.
- **Zero-Knowledge**: Encryption keys are derived from the user's wallet signature and never stored on any server.

## 5. User Flows

### 5.1 Onboarding
1. User lands on InkBlob.
2. Clicks "Connect Wallet" (Sui).
3. Signs a message to derive encryption keys (no gas).
4. Enters the workspace.

### 5.2 Creating a Note
1. Click `+` or "New Note".
2. Type title and content.
3. Use `/` to insert a table or heading.
4. Auto-save triggers encryption -> upload to Walrus -> update metadata on Sui.

## 6. Future Roadmap
- **Collaboration**: Real-time multi-player editing (CRDTs over P2P).
- **Publishing**: Turn any note into a public decentralized webpage.
- **Databases**: Notion-like database properties (tags, status, dates).
- **Media**: Drag-and-drop image/file uploads stored on Walrus.

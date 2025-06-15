# Jitsi JWT Worker

這是一個 Cloudflare Worker，用於生成 Jitsi Meet JWT 令牌，讓您可以安全地加入 Jitsi 會議室。

## 功能特色

- 生成符合 [Jitsi Meet JWT 規範](https://developer.8x8.com/jaas/docs/api-keys-jwt) 的令牌
- 支援自定義會議室名稱
- 內建用戶權限管理（主持人權限）
- 完整的 features 權限控制
- 基於 Cloudflare Workers 的無伺服器架構

## JWT 格式說明

根據 [8x8 JaaS 官方文檔](https://developer.8x8.com/jaas/docs/api-keys-jwt)，此 Worker 生成的 JWT 包含：

### Header
- `alg`: RS256
- `kid`: 您的 API 金鑰 ID
- `typ`: JWT

### Payload
- `aud`: "jitsi" (固定值)
- `iss`: "chat" (固定值)
- `sub`: 您的應用程式 ID
- `room`: 會議室名稱
- `context`: 包含用戶資訊和權限設定

### 支援的 Features
- `livestreaming`: 直播功能
- `recording`: 錄製功能
- `transcription`: 轉錄功能
- `sip-inbound-call`: SIP 撥入
- `sip-outbound-call`: SIP 撥出
- `inbound-call`: 電話撥入
- `outbound-call`: 電話撥出
- `send-groupchat`: 群組聊天
- `create-polls`: 建立投票

## 前置需求

- Node.js 18+
- Cloudflare 帳戶
- Jitsi Meet 帳戶（用於獲取 API 憑證）

## 安裝步驟

### 1. 克隆專案

```bash
git clone <your-repository-url>
cd vtaiwan-jaas-jwt-worker
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 設定環境變數

在 Cloudflare Workers 中設定以下環境變數：

- `JAAS_APP_ID`: 您的 Jitsi Meet 應用程式 ID
- `JAAS_KEY_ID`: 您的 Jitsi Meet 金鑰 ID
- `JAAS_PRIVATE_KEY`: 您的 Jitsi Meet 私鑰（PEM 格式）

## 本地開發

### 1. 安裝 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登入 Cloudflare

```bash
wrangler login
```

### 3. 設定本地環境變數

創建 `.dev.vars` 文件：

```bash
# .dev.vars
JAAS_APP_ID=your_app_id_here
JAAS_KEY_ID=your_key_id_here
JAAS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
your_private_key_content_here
-----END PRIVATE KEY-----"
```

### 4. 本地測試

```bash
wrangler dev
```

服務將在 `http://localhost:8787` 啟動。

### 5. 測試 API

使用 curl 或瀏覽器測試：

```bash
# 基本測試（使用預設會議室和預設用戶資訊）
curl "http://localhost:8787/api/jitsi-token"

# 完整參數測試
curl "http://localhost:8787/api/jitsi-token?room=my-meeting-room&user_id=user123&user_name=John%20Doe&user_email=john@example.com&user_moderator=true"

# 一般用戶測試（非主持人）
curl "http://localhost:8787/api/jitsi-token?room=test-room&user_id=user456&user_name=Jane%20Smith&user_email=jane@example.com&user_moderator=false"
```

預期回應：
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 部署到 Cloudflare Workers

### 1. 設定 wrangler.toml

確保 `wrangler.toml` 文件已正確配置：

```toml
name = "jitsi-jwt-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"

[vars]
# 環境變數將在 Cloudflare Dashboard 中設定
```

### 2. 部署

```bash
wrangler deploy
```

### 3. 在 Cloudflare Dashboard 中設定環境變數

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 進入 Workers & Pages
3. 選擇您的 Worker
4. 點擊 "Settings" > "Variables"
5. 添加以下環境變數：
   - `JAAS_APP_ID`
   - `JAAS_KEY_ID`
   - `JAAS_PRIVATE_KEY`

## API 使用方式

### 端點

`GET /api/jitsi-token`

### 參數

- `room` (可選): 會議室名稱，預設為 "default-room"
- `user_id` (可選): 用戶唯一識別碼，預設為 "user123"
- `user_name` (可選): 用戶顯示名稱，預設為 "Your User"
- `user_email` (可選): 用戶電子郵件，預設為 "user@example.com"
- `user_moderator` (可選): 是否為主持人，預設為 "true"（字串格式）

### 範例

```javascript
// 前端 JavaScript 範例
async function getJitsiToken(options = {}) {
  const {
    room = 'default-room',
    userId = 'user123',
    userName = 'Anonymous User',
    userEmail = 'user@example.com',
    isModerator = false
  } = options;

  const params = new URLSearchParams({
    room,
    user_id: userId,
    user_name: userName,
    user_email: userEmail,
    user_moderator: isModerator.toString()
  });

  const response = await fetch(`/api/jitsi-token?${params}`);
  const data = await response.json();
  return data.token;
}

// 使用範例
// 基本使用
const token1 = await getJitsiToken();

// 完整參數使用
const token2 = await getJitsiToken({
  room: 'my-meeting-room',
  userId: 'user123',
  userName: 'John Doe',
  userEmail: 'john@example.com',
  isModerator: true
});

console.log('JWT Token:', token2);
```

## 故障排除

### 常見問題

1. **JWT 生成失敗**
   - 檢查環境變數是否正確設定
   - 確認私鑰格式是否為有效的 PEM 格式

2. **Base64 解碼錯誤 (`atob() called with invalid base64-encoded data`)**
   - 確保 `JAAS_PRIVATE_KEY` 是完整的 PEM 格式
   - 檢查私鑰是否包含正確的標頭和標尾：
     ```
     -----BEGIN PRIVATE KEY-----
     [base64 encoded key content]
     -----END PRIVATE KEY-----"
     ```
   - 確保私鑰內容沒有額外的空格或特殊字符
   - **常見 PEM 格式問題**：
     - 缺少換行符：每行應該是 64 個字符
     - 包含無效字符：只能包含 A-Z, a-z, 0-9, +, /, =
     - 標頭標尾不正確：可能是 `RSA PRIVATE KEY` 而非 `PRIVATE KEY`
     - 編碼問題：確保使用 UTF-8 編碼

3. **加密私鑰錯誤**
   - **問題症狀**：私鑰包含以下內容：
     ```
     Proc-Type: 4,ENCRYPTED
     DEK-Info: AES-128-CBC,xxxxx
     ```
   - **原因**：您的私鑰是加密的，需要密碼才能使用
   - **解決方案**：
     ```bash
     # 方法 1：解密現有私鑰（會提示輸入密碼）
     openssl rsa -in encrypted-private-key.pem -out decrypted-private-key.pem

     # 方法 2：轉換為 PKCS#8 格式（推薦）
     openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in encrypted-private-key.pem -out unencrypted-private-key.pem

     # 方法 3：從 JaaS Dashboard 重新生成未加密的私鑰
     ```
   - **重要**：JaaS 只能使用**未加密的私鑰**

4. **PEM 格式驗證步驟**：
   1. 檢查您的私鑰是否以下列格式開始和結束：
      ```
      -----BEGIN PRIVATE KEY-----
      -----END PRIVATE KEY-----
      ```
      或
      ```
      -----BEGIN RSA PRIVATE KEY-----
      -----END RSA PRIVATE KEY-----
      ```

   2. 使用以下命令驗證 PEM 格式（如果您有 OpenSSL）：
      ```bash
      # 驗證私鑰格式
      openssl rsa -in your-private-key.pem -check -noout

      # 或者查看私鑰內容
      openssl rsa -in your-private-key.pem -text -noout

      # 轉換 RSA 私鑰為 PKCS#8 格式（推薦）
      openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in rsa-private-key.pem -out pkcs8-private-key.pem
      ```

   3. 在設定環境變數時，確保包含完整的 PEM 內容：
      ```bash
      # .dev.vars 範例 - 注意引號和換行符
      JAAS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
      MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
      ...完整的 base64 內容...
      -----END PRIVATE KEY-----"
      ```

   4. **重要提醒**：
      - 不要在 PEM 內容中包含額外的文字或註解
      - 確保每行長度不超過 64 個字符
      - 不要手動編輯 base64 內容
      - 如果從 JaaS Dashboard 複製，請確保完整複製包含標頭和標尾

   5. **常見的錯誤 PEM 格式**：
      ```bash
      # ❌ 錯誤：包含額外資訊
      Key ID: abc123
      -----BEGIN PRIVATE KEY-----
      ...

      # ❌ 錯誤：缺少標頭標尾
      MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...

      # ✅ 正確：純淨的 PEM 格式
      -----BEGIN PRIVATE KEY-----
      MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
      ...
      -----END PRIVATE KEY-----
      ```

5. **環境變數錯誤**
   - 確認所有必要的環境變數都已設定：
     - `JAAS_APP_ID`: 您的應用程式 ID（格式如：`vpaas-magic-cookie-xxxxxxxx`）
     - `JAAS_KEY_ID`: 您的金鑰 ID（格式如：`vpaas-magic-cookie-xxxxxxxx/xxxxxx`）
     - `JAAS_PRIVATE_KEY`: 完整的 PEM 格式私鑰

6. **CORS 錯誤**
   - 確保請求來源已正確配置
   - 檢查 Cloudflare Workers 的 CORS 設定

7. **權限錯誤**
   - 確認 Jitsi Meet 憑證是否有效
   - 檢查應用程式 ID 和金鑰 ID 是否匹配

### 除錯技巧

1. **查看即時日誌**：
   ```bash
   wrangler tail
   ```

2. **測試環境變數**：
   ```bash
   # 檢查環境變數是否正確設定
   curl "http://localhost:8787/api/jitsi-token?room=test-room&user_id=test123&user_name=Test%20User&user_email=test@example.com&user_moderator=true"
   ```

3. **驗證 JWT 格式**：
   - 使用 [jwt.io](https://jwt.io) 解碼生成的 JWT
   - 確認 payload 包含所有必要欄位

4. **PEM 格式驗證**：
   ```javascript
   // 在瀏覽器控制台測試 PEM 格式
   const testPem = `-----BEGIN PRIVATE KEY-----
   YOUR_KEY_CONTENT_HERE
   -----END PRIVATE KEY-----`;

   const b64 = testPem
     .replace(/-----BEGIN[^-]+-----/g, '')
     .replace(/-----END[^-]+-----/g, '')
     .replace(/\s+/g, '');

   console.log('Base64 valid:', /^[A-Za-z0-9+/]*={0,2}$/.test(b64));
   ```

### API 回應格式

**成功回應**：
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**錯誤回應**：
```json
{
  "error": "Missing required environment variables: JAAS_APP_ID, JAAS_KEY_ID, or JAAS_PRIVATE_KEY"
}
```

## 授權

此專案採用 MIT 授權條款。

## 貢獻

歡迎提交 Issue 和 Pull Request！

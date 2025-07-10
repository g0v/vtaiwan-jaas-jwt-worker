import { SignJWT } from 'jose';

import { generateOutline } from './ai.js';

// 允許的來源白名單
const ALLOWED_ORIGINS = [
  'https://vtaiwan.pages.dev',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4173',
	'http://localhost:4174',
  'http://localhost:8080',
  'http://localhost:8081',
  'https://vtaiwan.tw',
  'https://www.vtaiwan.tw',
  'https://talk.vtaiwan.tw',
  // 可以根據需要添加更多允許的來源
];

// 檢查來源是否被允許
function isOriginAllowed(origin) {
  return ALLOWED_ORIGINS.includes(origin);
}

// 動態生成 CORS headers
function getCorsHeaders(origin) {
  const isAllowed = isOriginAllowed(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 24 hours
    'Vary': 'Origin', // 重要：告訴快取這個回應會根據 Origin 而變化
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const origin = request.headers.get('Origin');

    // 處理 CORS preflight 請求
    if (request.method === 'OPTIONS') {
      const corsHeaders = getCorsHeaders(origin);

      // 如果來源不被允許，返回錯誤
      if (!isOriginAllowed(origin)) {
        return new Response('Origin not allowed', {
          status: 403,
          headers: corsHeaders,
        });
      }

      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

		// 單獨測試AI的整理功能
		if (pathname === '/api/test-ai') {
			const corsHeaders = getCorsHeaders(origin);
			// 從POST的attachment file中讀取transcription
			const formData = await request.formData();
			const file = formData.get('file');

			// 確保正確處理中文編碼
			const arrayBuffer = await file.arrayBuffer();
			const decoder = new TextDecoder('utf-8');
			const transcription = decoder.decode(arrayBuffer);
			// console.log(transcription);
			const outline = await generateOutline(transcription, env);
			console.log(outline);
			return new Response(outline, {
				status: 200,
				headers: corsHeaders,
			});
		}

		// 查詢整個Table
		if (pathname === '/api/query-table') {
			const corsHeaders = getCorsHeaders(origin);
			const transcriptions = await env.DB.prepare('SELECT * FROM transcriptions').all();
			return new Response(JSON.stringify(transcriptions.results), {
				status: 200,
				headers: corsHeaders,
			});
		}

		// 單獨創建Table
		if (pathname === '/api/create-table') {
			const corsHeaders = getCorsHeaders(origin);
			await env.DB.prepare('CREATE TABLE IF NOT EXISTS transcriptions (meeting_id TEXT, transcription TEXT, outline TEXT)').run();
			return new Response(JSON.stringify({ message: 'Table created successfully' }), {
				status: 200,
				headers: corsHeaders,
			});
		}

				// 上傳整篇逐字稿
		if (pathname === '/api/upload-transcription') {
			const corsHeaders = getCorsHeaders(origin);

			// 從POST的attachment file中讀取
			const formData = await request.formData();
			const file = formData.get('file');

			// 檔案名稱例，transcript-2025-06-21.txt，內容是逐字稿
			const meeting_id = file.name
				.replace('.txt', '')
				.replace('transcript-', '')
				.split('-')
				.join('');

			console.log('Meeting ID:', meeting_id);

			// 1. 讀取檔案內容
			const arrayBuffer = await file.arrayBuffer();
			const decoder = new TextDecoder('utf-8');
			const transcription = decoder.decode(arrayBuffer);
			console.log('File content read');

			// 2. 上傳到R2，內容原封不動
			const r2 = env.R2;
			const key = `${meeting_id}.txt`;
			await r2.put(key, file.stream(), {
				httpMetadata: {
					contentType: 'text/plain; charset=utf-8'
				}
			});
			console.log('File uploaded to R2:', key);

			// 3. AI處理
			const outline = await generateOutline(transcription, env);

			// 4. 檢查D1資料庫中是否存在
			const meeting = await env.DB.prepare('SELECT * FROM transcriptions WHERE meeting_id = ?').bind(meeting_id).first();

			if (!meeting) {
				// 創建一個新的逐字稿記錄
				console.log('Creating new transcription record');
				await env.DB.prepare('INSERT INTO transcriptions (meeting_id, transcription, outline) VALUES (?, ?, ?)').bind(meeting_id, transcription, outline).run();

				return new Response(JSON.stringify({
					message: 'Transcription created successfully',
					meeting_id: meeting_id,
					r2_key: key
				}), {
					status: 200,
					headers: corsHeaders,
				});
			} else {
				// 更新現有的逐字稿記錄
				console.log('Updating transcription record');
				await env.DB.prepare('UPDATE transcriptions SET transcription = ?, outline = ? WHERE meeting_id = ?').bind(transcription, outline, meeting_id).run();

				return new Response(JSON.stringify({
					message: 'Transcription updated successfully',
					meeting_id: meeting_id,
					r2_key: key
				}), {
					status: 200,
					headers: corsHeaders,
				});
			}
		}

		// 更新逐字稿的outline，從POST的JSON中獲取meeting_id和outline
		if (pathname === '/api/update-outline') {
			const corsHeaders = getCorsHeaders(origin);
			const { meeting_id, outline } = await request.json();
			await env.DB.prepare('UPDATE transcriptions SET outline = ? WHERE meeting_id = ?').bind(outline, meeting_id).run();
			return new Response(JSON.stringify({ message: 'Outline updated successfully' }), {
				status: 200,
				headers: corsHeaders,
			});
		}

		// Jitsi Token
    if (pathname === '/api/jitsi-token') {
      const corsHeaders = getCorsHeaders(origin);

      // 檢查來源是否被允許（對於實際請求）
      if (origin && !isOriginAllowed(origin)) {
        return new Response(JSON.stringify({
          error: 'Origin not allowed',
          allowed_origins: ALLOWED_ORIGINS
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          },
        });
      }

      const room = url.searchParams.get('room') || 'default-room';

      // 從 URL 參數獲取用戶資訊
      const user_info = {
        user_id: url.searchParams.get('user_id') || 'user123',
        user_name: url.searchParams.get('user_name') || 'Your User',
        user_email: url.searchParams.get('user_email') || 'user@example.com',
        user_moderator: url.searchParams.get('user_moderator') || 'true'
      };

      try {
        const token = await generateJaasJwt(room, user_info, env);
        return new Response(JSON.stringify({ token }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          },
        });
      }
    }

    return new Response('Not found', {
      status: 404,
      headers: getCorsHeaders(origin)
    });
  }
};

async function generateJaasJwt(room, user_info, env) {
  const appId = env.JAAS_APP_ID;
  const keyId = env.JAAS_KEY_ID;
  const privateKeyPem = env.JAAS_PRIVATE_KEY;

  if (!appId || !keyId || !privateKeyPem) {
    throw new Error('Missing required environment variables: JAAS_APP_ID, JAAS_KEY_ID, or JAAS_PRIVATE_KEY');
  }

  let privateKey;

  try {
    // 方法 1: 更強健的 PEM 處理
    console.log('Original PEM type:', typeof privateKeyPem);
    console.log('Original PEM length:', privateKeyPem.length);
    console.log('First 200 chars:', privateKeyPem.substring(0, 200));

    // 檢查是否為加密的私鑰
    if (privateKeyPem.includes('Proc-Type:') && privateKeyPem.includes('ENCRYPTED')) {
      throw new Error('Private key is encrypted. JaaS requires an unencrypted private key. Please decrypt your private key using: openssl rsa -in encrypted-key.pem -out decrypted-key.pem');
    }

    if (privateKeyPem.includes('DEK-Info:')) {
      throw new Error('Private key appears to be encrypted (contains DEK-Info). Please use an unencrypted private key for JaaS.');
    }

    // 先檢查是否包含 PEM 標記
    if (!privateKeyPem.includes('BEGIN') || !privateKeyPem.includes('END')) {
      throw new Error('PEM format appears to be invalid - missing BEGIN/END markers');
    }

    // 更徹底的清理 - 只保留 base64 字符
    let cleanedPem = privateKeyPem
      // 移除 PEM 標頭和標尾
      .replace(/-----BEGIN[^-]*-----/g, '')
      .replace(/-----END[^-]*-----/g, '')
      // 移除所有非 base64 字符
      .replace(/[^A-Za-z0-9+/=]/g, '');

    console.log('Cleaned PEM length:', cleanedPem.length);
    console.log('Cleaned PEM first 100 chars:', cleanedPem.substring(0, 100));

    if (!cleanedPem) {
      throw new Error('No valid base64 content found in PEM');
    }

    // 確保長度是 4 的倍數
    const paddingNeeded = (4 - cleanedPem.length % 4) % 4;
    const paddedB64 = cleanedPem + '='.repeat(paddingNeeded);

    console.log('Final base64 length:', paddedB64.length);
    console.log('Padding needed:', paddingNeeded);

    // 最後驗證 - 確保只包含有效的 base64 字符
    if (!/^[A-Za-z0-9+/=]*$/.test(paddedB64)) {
      throw new Error('Cleaned PEM still contains invalid characters');
    }

    const binaryKey = Uint8Array.from(atob(paddedB64), c => c.charCodeAt(0));

    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    console.log('Successfully imported private key using method 1');

  } catch (error) {
    console.error('Method 1 failed:', error.message);

    // 如果是 PKCS8 格式問題，嘗試其他格式
    try {
      console.log('Trying alternative key formats...');

      // 重新清理 PEM
      let cleanedPem = privateKeyPem
        .replace(/-----BEGIN[^-]*-----/g, '')
        .replace(/-----END[^-]*-----/g, '')
        .replace(/[^A-Za-z0-9+/=]/g, '');

      const paddingNeeded = (4 - cleanedPem.length % 4) % 4;
      const paddedB64 = cleanedPem + '='.repeat(paddingNeeded);
      const binaryKey = Uint8Array.from(atob(paddedB64), c => c.charCodeAt(0));

      // 嘗試不同的金鑰格式
      const formats = [
        { format: 'pkcs8', algorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } },
        { format: 'pkcs1', algorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } },
        { format: 'raw', algorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } }
      ];

      for (const { format, algorithm } of formats) {
        try {
          console.log(`Trying format: ${format}`);
          privateKey = await crypto.subtle.importKey(
            format,
            binaryKey.buffer,
            algorithm,
            false,
            ['sign']
          );
          console.log(`Successfully imported private key using format: ${format}`);
          break;
        } catch (formatError) {
          console.log(`Format ${format} failed:`, formatError.message);
        }
      }

      if (!privateKey) {
        throw new Error('All key formats failed');
      }

    } catch (error2) {
      console.error('All methods failed:', error2.message);

      // 提供詳細的除錯資訊
      const pemSample = privateKeyPem.substring(0, 500);
      const hasBegin = privateKeyPem.includes('BEGIN');
      const hasEnd = privateKeyPem.includes('END');
      const specialChars = privateKeyPem.match(/[^A-Za-z0-9+/=\s\-:]/g);

      throw new Error(`Failed to import private key.
        Original error: ${error.message}
        Secondary error: ${error2.message}
        PEM sample: ${pemSample}
        Has BEGIN: ${hasBegin}
        Has END: ${hasEnd}
        Special chars found: ${specialChars ? specialChars.join(', ') : 'none'}
        Please ensure your JAAS_PRIVATE_KEY is a valid PEM format private key.`);
    }
  }

    // 根據官方文檔設定 JWT payload
  const now = Math.floor(Date.now() / 1000);

  // 設定用戶資訊的預設值
  const userId = user_info.user_id || "user123";
  const userName = user_info.user_name || "Your User";
  const userEmail = user_info.user_email || "user@example.com";
  const userModerator = user_info.user_moderator || "true";

  const jwt = await new SignJWT({
    aud: 'jitsi',
    iss: 'chat', // 官方文檔規定的固定值
    sub: appId,
    room: room, // 直接使用房間名稱
    exp: now + 3600, // 1小時後過期
    nbf: now, // 立即生效
    context: {
      user: {
        id: userId,
        name: userName,
        email: userEmail,
        moderator: userModerator // 字串格式
      },
      features: {
				"livestreaming": true,
				"outbound-call": true,
				"sip-outbound-call": false,
				"transcription": false,
				"recording": false
      },
      room: {
        regex: false
      }
    }
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId, typ: 'JWT' })
    .sign(privateKey);

  return jwt;
}

// 修正的 PEM 解析函數
function pemToArrayBuffer(pem) {
  try {
    // 記錄原始 PEM 的前 100 個字符用於除錯
    console.log('Original PEM (first 100 chars):', pem.substring(0, 100));

    // 移除所有可能的 PEM 標頭和標尾
    let cleanedPem = pem
      .replace(/-----BEGIN[^-]*-----/g, '')
      .replace(/-----END[^-]*-----/g, '')
      .replace(/\r\n/g, '') // Windows 換行符
      .replace(/\n/g, '')   // Unix 換行符
      .replace(/\r/g, '')   // Mac 換行符
      .replace(/\s/g, '')   // 所有空白字符
      .replace(/\t/g, '');  // Tab 字符

    console.log('Cleaned PEM (first 100 chars):', cleanedPem.substring(0, 100));
    console.log('Cleaned PEM length:', cleanedPem.length);

    // 檢查是否為空
    if (!cleanedPem) {
      throw new Error('PEM content is empty after cleaning');
    }

    // 更寬鬆的 base64 驗證 - 只檢查是否包含有效字符
    const base64Regex = /^[A-Za-z0-9+/=]*$/;
    if (!base64Regex.test(cleanedPem)) {
      // 找出無效字符
      const invalidChars = cleanedPem.match(/[^A-Za-z0-9+/=]/g);
      throw new Error(`Invalid characters found in PEM: ${invalidChars ? invalidChars.join(', ') : 'unknown'}`);
    }

    // 確保長度是 4 的倍數（加入適當的 padding）
    const paddingNeeded = (4 - cleanedPem.length % 4) % 4;
    const paddedB64 = cleanedPem + '='.repeat(paddingNeeded);

    console.log('Final base64 length:', paddedB64.length);
    console.log('Padding added:', paddingNeeded);

    // 嘗試解碼
    const binary = atob(paddedB64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);

    for (let i = 0; i < binary.length; i++) {
      view[i] = binary.charCodeAt(i);
    }

    console.log('Successfully decoded PEM, buffer length:', buffer.byteLength);
    return buffer;

  } catch (error) {
    console.error('PEM parsing error:', error.message);

    // 提供更詳細的錯誤資訊
    if (error.message.includes('atob')) {
      throw new Error(`Base64 decoding failed: ${error.message}. Please ensure your JAAS_PRIVATE_KEY is a valid PEM format.`);
    }

    throw new Error(`PEM parsing failed: ${error.message}`);
  }
}

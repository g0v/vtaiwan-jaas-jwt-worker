import { SignJWT } from 'jose';

// 導入工具函數
import {
  initializeDatabase,
  upsertMeeting,
  getMeeting,
  getAllMeetings,
  insertTranscription,
  getMeetingTranscriptions,
  deleteMeeting,
  getMeetingStats
} from './utils/read_write_D1.js';

import {
  uploadToR2,
  downloadFromR2,
  generateMeetingKey,
  generateSummaryKey,
  createMeetingFolder
} from './utils/read_write_R2.js';

import {
  batchProcessTranscriptions,
  formatTranscriptionsToMarkdown,
  generateMeetingSummary,
  validateTranscriptionData
} from './functions/transcription.js';

// 允許的來源白名單
const ALLOWED_ORIGINS = [
  'https://vtaiwan.pages.dev',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8080',
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

// 檢查用戶是否為主持人
function checkModeratorPermission(request) {
  // 這裡可以根據需要實作更複雜的權限檢查
  const userModerator = request.headers.get('X-User-Moderator') ||
                       new URL(request.url).searchParams.get('user_moderator');
  return userModerator === 'true';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const origin = request.headers.get('Origin');

    // 初始化資料庫（首次運行時）
    if (env.DB) {
      try {
        await initializeDatabase(env.DB);
      } catch (error) {
        console.error('Database initialization error:', error);
      }
    }

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

    try {
      // JWT Token 路由（原有功能）
      if (pathname === '/api/jitsi-token') {
        return await handleJitsiToken(request, env, corsHeaders);
      }

      // 逐字稿相關路由
      if (pathname.startsWith('/api/transcription')) {
        return await handleTranscriptionRoutes(request, env, corsHeaders);
      }

      // 會議相關路由
      if (pathname.startsWith('/api/meetings')) {
        return await handleMeetingRoutes(request, env, corsHeaders);
      }

      return new Response('Not found', {
        status: 404,
        headers: corsHeaders
      });

    } catch (error) {
      console.error('Request handling error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
      });
    }
  }
};

// 處理 Jitsi Token 請求（原有功能）
async function handleJitsiToken(request, env, corsHeaders) {
  const url = new URL(request.url);
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

// 處理逐字稿相關路由
async function handleTranscriptionRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // POST /api/transcription - 接收逐字稿
  if (pathname === '/api/transcription' && request.method === 'POST') {
    return await handleSubmitTranscription(request, env, corsHeaders);
  }

  // GET /api/transcription/{meetingId} - 獲取會議逐字稿
  if (pathname.match(/^\/api\/transcription\/([^\/]+)$/) && request.method === 'GET') {
    const meetingId = pathname.split('/')[3];
    return await handleGetTranscription(meetingId, env, corsHeaders);
  }

  // GET /api/transcription/{meetingId}/markdown - 獲取 Markdown 格式逐字稿
  if (pathname.match(/^\/api\/transcription\/([^\/]+)\/markdown$/) && request.method === 'GET') {
    const meetingId = pathname.split('/')[3];
    return await handleGetMarkdownTranscription(meetingId, env, corsHeaders);
  }

  return new Response('Not found', {
    status: 404,
    headers: corsHeaders
  });
}

// 處理會議相關路由
async function handleMeetingRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // GET /api/meetings - 獲取會議列表
  if (pathname === '/api/meetings' && request.method === 'GET') {
    return await handleGetMeetings(request, env, corsHeaders);
  }

  // POST /api/meetings - 創建會議
  if (pathname === '/api/meetings' && request.method === 'POST') {
    return await handleCreateMeeting(request, env, corsHeaders);
  }

  // GET /api/meetings/{meetingId} - 獲取特定會議
  if (pathname.match(/^\/api\/meetings\/([^\/]+)$/) && request.method === 'GET') {
    const meetingId = pathname.split('/')[3];
    return await handleGetMeeting(meetingId, env, corsHeaders);
  }

  return new Response('Not found', {
    status: 404,
    headers: corsHeaders
  });
}

// 提交逐字稿
async function handleSubmitTranscription(request, env, corsHeaders) {
  // 檢查主持人權限
  if (!checkModeratorPermission(request)) {
    return new Response(JSON.stringify({
      error: 'Only moderators can submit transcriptions'
    }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  }

  try {
    const data = await request.json();

    // 驗證必要欄位
    if (!data.meeting_id || !data.transcriptions || !Array.isArray(data.transcriptions)) {
      return new Response(JSON.stringify({
        error: 'Invalid request format. Expected: { meeting_id, transcriptions: [] }'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
      });
    }

    // 處理逐字稿資料
    const { processed, errors } = batchProcessTranscriptions(data.transcriptions);

    if (errors.length > 0) {
      console.warn('Transcription processing errors:', errors);
    }

    // 儲存到 D1
    const results = [];
    for (const transcription of processed) {
      const result = await insertTranscription(env.DB, transcription);
      results.push(result);
    }

    // 生成並儲存 Markdown 到 R2
    const allTranscriptions = await getMeetingTranscriptions(env.DB, data.meeting_id);
    const meetingInfo = await getMeeting(env.DB, data.meeting_id);

    if (allTranscriptions.length > 0) {
      const markdown = formatTranscriptionsToMarkdown(allTranscriptions, meetingInfo);
      const markdownKey = generateMeetingKey(data.meeting_id, 'md');
      await uploadToR2(env.R2, markdownKey, markdown);

      // 生成摘要
      const summary = generateMeetingSummary(allTranscriptions, meetingInfo);
      const summaryKey = generateSummaryKey(data.meeting_id);
      await uploadToR2(env.R2, summaryKey, summary);
    }

    const duplicateCount = results.filter(r => r.duplicate).length;
    const newCount = results.filter(r => !r.duplicate).length;

    return new Response(JSON.stringify({
      success: true,
      processed: processed.length,
      new_entries: newCount,
      duplicates: duplicateCount,
      errors: errors.length,
      meeting_id: data.meeting_id
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });

  } catch (error) {
    console.error('Submit transcription error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to process transcription',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  }
}

// 獲取逐字稿
async function handleGetTranscription(meetingId, env, corsHeaders) {
  try {
    const transcriptions = await getMeetingTranscriptions(env.DB, meetingId);
    const meetingInfo = await getMeeting(env.DB, meetingId);
    const stats = await getMeetingStats(env.DB, meetingId);

    return new Response(JSON.stringify({
      meeting: meetingInfo,
      transcriptions,
      stats
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  } catch (error) {
    console.error('Get transcription error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get transcription',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  }
}

// 獲取 Markdown 格式逐字稿
async function handleGetMarkdownTranscription(meetingId, env, corsHeaders) {
  try {
    const markdownKey = generateMeetingKey(meetingId, 'md');
    const result = await downloadFromR2(env.R2, markdownKey);

    if (!result.success) {
      // 如果 R2 中沒有，從 D1 重新生成
      const transcriptions = await getMeetingTranscriptions(env.DB, meetingId);
      const meetingInfo = await getMeeting(env.DB, meetingId);

      if (transcriptions.length === 0) {
        return new Response('Meeting transcription not found', {
          status: 404,
          headers: corsHeaders
        });
      }

      const markdown = formatTranscriptionsToMarkdown(transcriptions, meetingInfo);

      // 儲存到 R2 以供下次使用
      await uploadToR2(env.R2, markdownKey, markdown);

      return new Response(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          ...corsHeaders
        },
      });
    }

    return new Response(result.content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        ...corsHeaders
      },
    });
  } catch (error) {
    console.error('Get markdown transcription error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get markdown transcription',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  }
}

// 獲取會議列表
async function handleGetMeetings(request, env, corsHeaders) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;

    const meetings = await getAllMeetings(env.DB, limit, offset);

    return new Response(JSON.stringify({
      meetings,
      pagination: {
        limit,
        offset,
        count: meetings.length
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  } catch (error) {
    console.error('Get meetings error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get meetings',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  }
}

// 創建會議
async function handleCreateMeeting(request, env, corsHeaders) {
  // 檢查主持人權限
  if (!checkModeratorPermission(request)) {
    return new Response(JSON.stringify({
      error: 'Only moderators can create meetings'
    }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  }

  try {
    const data = await request.json();

    if (!data.id || !data.title || !data.date) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: id, title, date'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
      });
    }

    const result = await upsertMeeting(env.DB, data);

    // 創建 R2 資料夾結構
    if (env.R2) {
      await createMeetingFolder(env.R2, data.id);
    }

    return new Response(JSON.stringify({
      success: true,
      meeting: result
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  } catch (error) {
    console.error('Create meeting error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to create meeting',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  }
}

// 獲取特定會議
async function handleGetMeeting(meetingId, env, corsHeaders) {
  try {
    const meeting = await getMeeting(env.DB, meetingId);

    if (!meeting) {
      return new Response('Meeting not found', {
        status: 404,
        headers: corsHeaders
      });
    }

    const stats = await getMeetingStats(env.DB, meetingId);

    return new Response(JSON.stringify({
      meeting,
      stats
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  } catch (error) {
    console.error('Get meeting error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get meeting',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  }
}

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
        livestreaming: "false",
        recording: "false",
        transcription: "false",
        "sip-inbound-call": "false",
        "sip-outbound-call": "false",
        "inbound-call": "false",
        "outbound-call": "false",
        "send-groupchat": "true",
        "create-polls": "true"
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

// R2 儲存操作工具函數

/**
 * 上傳檔案到 R2
 */
export async function uploadToR2(r2, key, content, contentType = 'text/markdown') {
  try {
    await r2.put(key, content, {
      httpMetadata: {
        contentType: contentType,
        cacheControl: 'public, max-age=3600',
      },
      customMetadata: {
        uploadedAt: new Date().toISOString(),
      },
    });

    return { success: true, key };
  } catch (error) {
    console.error('Failed to upload to R2:', error);
    throw error;
  }
}

/**
 * 從 R2 下載檔案
 */
export async function downloadFromR2(r2, key) {
  try {
    const object = await r2.get(key);

    if (!object) {
      return { success: false, error: 'File not found' };
    }

    const content = await object.text();
    const metadata = {
      size: object.size,
      etag: object.etag,
      uploaded: object.uploaded,
      httpMetadata: object.httpMetadata,
      customMetadata: object.customMetadata,
    };

    return { success: true, content, metadata };
  } catch (error) {
    console.error('Failed to download from R2:', error);
    throw error;
  }
}

/**
 * 刪除 R2 中的檔案
 */
export async function deleteFromR2(r2, key) {
  try {
    await r2.delete(key);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete from R2:', error);
    throw error;
  }
}

/**
 * 檢查檔案是否存在
 */
export async function checkFileExists(r2, key) {
  try {
    const object = await r2.head(key);
    return { exists: !!object, metadata: object };
  } catch (error) {
    console.error('Failed to check file existence:', error);
    return { exists: false };
  }
}

/**
 * 列出指定前綴的所有檔案
 */
export async function listFiles(r2, prefix = '', limit = 1000) {
  try {
    const objects = await r2.list({
      prefix: prefix,
      limit: limit,
    });

    return {
      success: true,
      files: objects.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        etag: obj.etag,
        uploaded: obj.uploaded,
      })),
      truncated: objects.truncated,
    };
  } catch (error) {
    console.error('Failed to list files:', error);
    throw error;
  }
}

/**
 * 生成會議逐字稿的 R2 key
 */
export function generateMeetingKey(meetingId, format = 'markdown') {
  const date = new Date().toISOString().split('T')[0];
  return `meetings/${date}/${meetingId}/transcription.${format}`;
}

/**
 * 生成會議摘要的 R2 key
 */
export function generateSummaryKey(meetingId) {
  const date = new Date().toISOString().split('T')[0];
  return `meetings/${date}/${meetingId}/summary.md`;
}

/**
 * 批量上傳多個檔案
 */
export async function batchUpload(r2, files) {
  const results = [];

  for (const file of files) {
    try {
      const result = await uploadToR2(r2, file.key, file.content, file.contentType);
      results.push({ ...result, originalKey: file.key });
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        originalKey: file.key
      });
    }
  }

  return results;
}

/**
 * 創建會議資料夾結構
 */
export async function createMeetingFolder(r2, meetingId) {
  const date = new Date().toISOString().split('T')[0];
  const folderKey = `meetings/${date}/${meetingId}/`;

  // 創建一個空的 .gitkeep 檔案來確保資料夾存在
  await uploadToR2(r2, `${folderKey}.gitkeep`, '', 'text/plain');

  return { success: true, folderPath: folderKey };
}

/**
 * 獲取會議的所有相關檔案
 */
export async function getMeetingFiles(r2, meetingId) {
  const date = new Date().toISOString().split('T')[0];
  const prefix = `meetings/${date}/${meetingId}/`;

  return await listFiles(r2, prefix);
}

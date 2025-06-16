// R2 儲存操作工具函數

// 上傳檔案到 R2
export async function uploadToR2(r2, key, content, metadata = {}) {
  try {
    const object = await r2.put(key, content, {
      httpMetadata: {
        contentType: metadata.contentType || 'text/plain; charset=utf-8',
        ...metadata.httpMetadata
      },
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        ...metadata.customMetadata
      }
    });

    return {
      success: true,
      key,
      etag: object.etag,
      size: object.size
    };
  } catch (error) {
    console.error('R2 upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 從 R2 下載檔案
export async function downloadFromR2(r2, key) {
  try {
    const object = await r2.get(key);

    if (!object) {
      return {
        success: false,
        error: 'File not found'
      };
    }

    const content = await object.text();

    return {
      success: true,
      content,
      metadata: {
        size: object.size,
        etag: object.etag,
        uploaded: object.uploaded,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata
      }
    };
  } catch (error) {
    console.error('R2 download error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 檢查檔案是否存在
export async function fileExists(r2, key) {
  try {
    const object = await r2.head(key);
    return object !== null;
  } catch (error) {
    return false;
  }
}

// 刪除檔案
export async function deleteFromR2(r2, key) {
  try {
    await r2.delete(key);
    return { success: true };
  } catch (error) {
    console.error('R2 delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 列出檔案
export async function listFiles(r2, prefix = '', limit = 1000) {
  try {
    const objects = await r2.list({
      prefix,
      limit
    });

    return {
      success: true,
      objects: objects.objects.map(obj => ({
        key: obj.key,
        size: obj.size,
        etag: obj.etag,
        uploaded: obj.uploaded
      })),
      truncated: objects.truncated,
      cursor: objects.cursor
    };
  } catch (error) {
    console.error('R2 list error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 生成會議檔案的 key
export function generateMeetingKey(meetingId, fileType = 'md') {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `meetings/${date}/${meetingId}/transcription.${fileType}`;
}

// 生成摘要檔案的 key
export function generateSummaryKey(meetingId) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `meetings/${date}/${meetingId}/summary.md`;
}

// 生成附件檔案的 key
export function generateAttachmentKey(meetingId, filename) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `meetings/${date}/${meetingId}/attachments/${filename}`;
}

// 創建會議資料夾結構（通過上傳一個空的 .gitkeep 檔案）
export async function createMeetingFolder(r2, meetingId) {
  try {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const folderKey = `meetings/${date}/${meetingId}/.gitkeep`;

    await uploadToR2(r2, folderKey, '', {
      customMetadata: {
        purpose: 'folder-structure',
        meetingId,
        createdAt: new Date().toISOString()
      }
    });

    return { success: true, folderPath: `meetings/${date}/${meetingId}/` };
  } catch (error) {
    console.error('Create meeting folder error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 批次上傳檔案
export async function batchUpload(r2, files) {
  const results = [];

  for (const file of files) {
    const result = await uploadToR2(r2, file.key, file.content, file.metadata);
    results.push({
      key: file.key,
      ...result
    });
  }

  return results;
}

// 批次刪除檔案
export async function batchDelete(r2, keys) {
  const results = [];

  for (const key of keys) {
    const result = await deleteFromR2(r2, key);
    results.push({
      key,
      ...result
    });
  }

  return results;
}

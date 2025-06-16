// 使用 Web Crypto API 生成 hash 值（用於去重）
export async function generateTranscriptionHash(meetingId, speaker, content, timestamp) {
  const data = `${meetingId}-${speaker}-${content}-${timestamp}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * 驗證逐字稿資料格式
 */
export function validateTranscriptionData(data) {
  const required = ['meeting_id', 'speaker', 'content', 'timestamp'];
  const missing = required.filter(field => !data[field]);

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missing.join(', ')}`
    };
  }

  // 驗證時間戳格式
  if (isNaN(Date.parse(data.timestamp))) {
    return {
      valid: false,
      error: 'Invalid timestamp format'
    };
  }

  return { valid: true };
}

/**
 * 處理單條逐字稿資料
 */
export async function processTranscriptionEntry(data, sequence = 0) {
  const validation = validateTranscriptionData(data);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 使用 Web Crypto API 生成 UUID
  const id = crypto.randomUUID();
  const hash = await generateTranscriptionHash(
    data.meeting_id,
    data.speaker,
    data.content,
    data.timestamp
  );

  return {
    id,
    meeting_id: data.meeting_id,
    speaker: data.speaker.trim(),
    content: data.content.trim(),
    timestamp: data.timestamp,
    sequence: sequence,
    hash
  };
}

/**
 * 將逐字稿陣列轉換為 Markdown 格式
 */
export function formatTranscriptionsToMarkdown(transcriptions, meetingInfo = {}) {
  if (!transcriptions || transcriptions.length === 0) {
    return '# 會議逐字稿\n\n*暫無逐字稿內容*\n';
  }

  let markdown = '';

  // 會議標題和資訊
  if (meetingInfo.title) {
    markdown += `# ${meetingInfo.title}\n\n`;
  } else {
    markdown += '# 會議逐字稿\n\n';
  }

  if (meetingInfo.date) {
    markdown += `**日期：** ${meetingInfo.date}\n\n`;
  }

  if (meetingInfo.id) {
    markdown += `**會議 ID：** ${meetingInfo.id}\n\n`;
  }

  // 統計資訊
  const speakers = [...new Set(transcriptions.map(t => t.speaker))];
  markdown += `**發言人數：** ${speakers.length}\n`;
  markdown += `**逐字稿條數：** ${transcriptions.length}\n\n`;

  markdown += '---\n\n';

  // 逐字稿內容
  let currentSpeaker = '';
  let speakerStartTime = '';

  transcriptions.forEach((transcription, index) => {
    const { speaker, content, timestamp } = transcription;
    const formattedTime = formatTimestamp(timestamp);

    // 如果發言人改變，添加新的發言人標題
    if (speaker !== currentSpeaker) {
      if (currentSpeaker !== '') {
        markdown += '\n';
      }

      currentSpeaker = speaker;
      speakerStartTime = formattedTime;
      markdown += `## ${speaker}\n`;
      markdown += `*${formattedTime}*\n\n`;
    }

    // 添加發言內容
    markdown += `${content}\n\n`;
  });

  // 添加頁尾
  markdown += '---\n\n';
  markdown += `*逐字稿生成時間：${new Date().toLocaleString('zh-TW')}*\n`;

  return markdown;
}

/**
 * 格式化時間戳
 */
export function formatTimestamp(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    return timestamp;
  }
}

/**
 * 按發言人分組逐字稿
 */
export function groupTranscriptionsBySpeaker(transcriptions) {
  const grouped = {};

  transcriptions.forEach(transcription => {
    const speaker = transcription.speaker;
    if (!grouped[speaker]) {
      grouped[speaker] = [];
    }
    grouped[speaker].push(transcription);
  });

  return grouped;
}

/**
 * 生成會議摘要
 */
export function generateMeetingSummary(transcriptions, meetingInfo = {}) {
  if (!transcriptions || transcriptions.length === 0) {
    return '# 會議摘要\n\n*暫無內容可供摘要*\n';
  }

  const speakers = [...new Set(transcriptions.map(t => t.speaker))];
  const startTime = transcriptions[0]?.timestamp;
  const endTime = transcriptions[transcriptions.length - 1]?.timestamp;

  let summary = '';

  if (meetingInfo.title) {
    summary += `# ${meetingInfo.title} - 會議摘要\n\n`;
  } else {
    summary += '# 會議摘要\n\n';
  }

  // 基本資訊
  summary += '## 會議基本資訊\n\n';
  if (meetingInfo.date) {
    summary += `- **日期：** ${meetingInfo.date}\n`;
  }
  if (startTime && endTime) {
    summary += `- **時間：** ${formatTimestamp(startTime)} - ${formatTimestamp(endTime)}\n`;
  }
  summary += `- **參與人數：** ${speakers.length} 人\n`;
  summary += `- **發言次數：** ${transcriptions.length} 次\n\n`;

  // 參與者列表
  summary += '## 參與者\n\n';
  speakers.forEach(speaker => {
    const speakerTranscriptions = transcriptions.filter(t => t.speaker === speaker);
    summary += `- **${speaker}** (${speakerTranscriptions.length} 次發言)\n`;
  });
  summary += '\n';

  // 發言統計
  summary += '## 發言統計\n\n';
  const speakerStats = groupTranscriptionsBySpeaker(transcriptions);
  Object.entries(speakerStats).forEach(([speaker, speeches]) => {
    const totalWords = speeches.reduce((sum, speech) => sum + speech.content.length, 0);
    summary += `- **${speaker}：** ${speeches.length} 次發言，約 ${totalWords} 字\n`;
  });

  summary += '\n---\n\n';
  summary += `*摘要生成時間：${new Date().toLocaleString('zh-TW')}*\n`;

  return summary;
}

/**
 * 清理和標準化發言人名稱
 */
export function normalizeSpeakerName(speaker) {
  return speaker
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u4e00-\u9fff]/g, '') // 保留中文、英文、數字和空格
    .substring(0, 50); // 限制長度
}

/**
 * 批量處理逐字稿資料
 */
export async function batchProcessTranscriptions(transcriptionsData) {
  const processed = [];
  const errors = [];

  for (let index = 0; index < transcriptionsData.length; index++) {
    const data = transcriptionsData[index];
    try {
      // 標準化發言人名稱
      if (data.speaker) {
        data.speaker = normalizeSpeakerName(data.speaker);
      }

      const processedEntry = await processTranscriptionEntry(data, index);
      processed.push(processedEntry);
    } catch (error) {
      errors.push({
        index,
        data,
        error: error.message
      });
    }
  }

  return { processed, errors };
}

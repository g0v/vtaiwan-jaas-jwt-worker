// 逐字稿處理函數

// 使用 Web Crypto API 生成 hash
async function generateHash(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// 驗證逐字稿資料格式
export function validateTranscriptionData(transcription) {
  const errors = [];

  if (!transcription.meeting_id || typeof transcription.meeting_id !== 'string') {
    errors.push('meeting_id is required and must be a string');
  }

  if (!transcription.speaker || typeof transcription.speaker !== 'string') {
    errors.push('speaker is required and must be a string');
  }

  if (!transcription.content || typeof transcription.content !== 'string') {
    errors.push('content is required and must be a string');
  }

  if (!transcription.timestamp || typeof transcription.timestamp !== 'string') {
    errors.push('timestamp is required and must be a string');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// 正規化說話者名稱
function normalizeSpeakerName(speaker) {
  return speaker
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u4e00-\u9fff]/g, '') // 保留中文、英文、數字和空格
    .substring(0, 50); // 限制長度
}

// 批次處理逐字稿
export async function batchProcessTranscriptions(transcriptions) {
  const processed = [];
  const errors = [];

  for (let i = 0; i < transcriptions.length; i++) {
    try {
      const transcription = transcriptions[i];

      // 驗證資料格式
      const validation = validateTranscriptionData(transcription);
      if (!validation.isValid) {
        errors.push({
          index: i,
          errors: validation.errors,
          data: transcription
        });
        continue;
      }

      // 正規化資料
      const normalizedTranscription = {
        meeting_id: transcription.meeting_id.trim(),
        speaker: normalizeSpeakerName(transcription.speaker),
        content: transcription.content.trim(),
        timestamp: transcription.timestamp.trim()
      };

      // 生成內容 hash 用於去重
      const contentForHash = `${normalizedTranscription.meeting_id}|${normalizedTranscription.speaker}|${normalizedTranscription.content}|${normalizedTranscription.timestamp}`;
      const hash = await generateHash(contentForHash);

      processed.push({
        ...normalizedTranscription,
        hash
      });

    } catch (error) {
      errors.push({
        index: i,
        error: error.message,
        data: transcriptions[i]
      });
    }
  }

  return { processed, errors };
}

// 將逐字稿格式化為 Markdown
export function formatTranscriptionsToMarkdown(transcriptions, meetingInfo = null) {
  if (!transcriptions || transcriptions.length === 0) {
    return '# 會議逐字稿\n\n尚無逐字稿內容。';
  }

  let markdown = '';

  // 會議標題和資訊
  if (meetingInfo) {
    markdown += `# ${meetingInfo.title}\n\n`;
    markdown += `**日期：** ${meetingInfo.date}\n\n`;
    if (meetingInfo.description) {
      markdown += `**說明：** ${meetingInfo.description}\n\n`;
    }
    markdown += '---\n\n';
  } else {
    markdown += '# 會議逐字稿\n\n';
  }

  // 按說話者分組
  const groupedBySpeaker = [];
  let currentGroup = null;

  for (const transcription of transcriptions) {
    if (!currentGroup || currentGroup.speaker !== transcription.speaker) {
      if (currentGroup) {
        groupedBySpeaker.push(currentGroup);
      }
      currentGroup = {
        speaker: transcription.speaker,
        entries: [transcription]
      };
    } else {
      currentGroup.entries.push(transcription);
    }
  }

  if (currentGroup) {
    groupedBySpeaker.push(currentGroup);
  }

  // 生成 Markdown 內容
  for (const group of groupedBySpeaker) {
    markdown += `## ${group.speaker}\n\n`;

    for (const entry of group.entries) {
      markdown += `**${entry.timestamp}**\n\n`;
      markdown += `${entry.content}\n\n`;
    }

    markdown += '---\n\n';
  }

  // 添加統計資訊
  const uniqueSpeakers = [...new Set(transcriptions.map(t => t.speaker))];
  const totalEntries = transcriptions.length;
  const firstTimestamp = transcriptions[0]?.timestamp;
  const lastTimestamp = transcriptions[transcriptions.length - 1]?.timestamp;

  markdown += '## 會議統計\n\n';
  markdown += `- **總發言數：** ${totalEntries}\n`;
  markdown += `- **發言人數：** ${uniqueSpeakers.length}\n`;
  markdown += `- **發言人：** ${uniqueSpeakers.join('、')}\n`;
  if (firstTimestamp && lastTimestamp) {
    markdown += `- **時間範圍：** ${firstTimestamp} ~ ${lastTimestamp}\n`;
  }
  markdown += `- **生成時間：** ${new Date().toLocaleString('zh-TW')}\n`;

  return markdown;
}

// 生成會議摘要
export function generateMeetingSummary(transcriptions, meetingInfo = null) {
  if (!transcriptions || transcriptions.length === 0) {
    return '# 會議摘要\n\n尚無逐字稿內容可供摘要。';
  }

  let summary = '';

  // 會議基本資訊
  if (meetingInfo) {
    summary += `# ${meetingInfo.title} - 會議摘要\n\n`;
    summary += `**日期：** ${meetingInfo.date}\n\n`;
    if (meetingInfo.description) {
      summary += `**說明：** ${meetingInfo.description}\n\n`;
    }
  } else {
    summary += '# 會議摘要\n\n';
  }

  // 統計資訊
  const uniqueSpeakers = [...new Set(transcriptions.map(t => t.speaker))];
  const totalEntries = transcriptions.length;
  const firstTimestamp = transcriptions[0]?.timestamp;
  const lastTimestamp = transcriptions[transcriptions.length - 1]?.timestamp;

  summary += '## 會議概況\n\n';
  summary += `- **參與人數：** ${uniqueSpeakers.length} 人\n`;
  summary += `- **發言人：** ${uniqueSpeakers.join('、')}\n`;
  summary += `- **總發言數：** ${totalEntries} 次\n`;
  if (firstTimestamp && lastTimestamp) {
    summary += `- **會議時間：** ${firstTimestamp} ~ ${lastTimestamp}\n`;
  }
  summary += '\n';

  // 各發言人統計
  summary += '## 發言統計\n\n';
  const speakerStats = {};

  for (const transcription of transcriptions) {
    if (!speakerStats[transcription.speaker]) {
      speakerStats[transcription.speaker] = {
        count: 0,
        totalLength: 0
      };
    }
    speakerStats[transcription.speaker].count++;
    speakerStats[transcription.speaker].totalLength += transcription.content.length;
  }

  for (const [speaker, stats] of Object.entries(speakerStats)) {
    const avgLength = Math.round(stats.totalLength / stats.count);
    summary += `- **${speaker}：** ${stats.count} 次發言，平均 ${avgLength} 字\n`;
  }

  summary += '\n';

  // 主要討論內容（取前幾個較長的發言）
  summary += '## 主要討論內容\n\n';
  const longEntries = transcriptions
    .filter(t => t.content.length > 50) // 過濾較短的發言
    .sort((a, b) => b.content.length - a.content.length) // 按長度排序
    .slice(0, 5); // 取前5個

  for (const entry of longEntries) {
    summary += `### ${entry.speaker} (${entry.timestamp})\n\n`;
    summary += `${entry.content}\n\n`;
  }

  summary += `---\n\n*摘要生成時間：${new Date().toLocaleString('zh-TW')}*\n`;

  return summary;
}

// 搜尋逐字稿內容
export function searchTranscriptions(transcriptions, keyword) {
  if (!keyword || !transcriptions) {
    return [];
  }

  const results = [];
  const searchTerm = keyword.toLowerCase();

  for (const transcription of transcriptions) {
    if (transcription.content.toLowerCase().includes(searchTerm) ||
        transcription.speaker.toLowerCase().includes(searchTerm)) {
      results.push({
        ...transcription,
        relevance: transcription.content.toLowerCase().split(searchTerm).length - 1
      });
    }
  }

  // 按相關性排序
  return results.sort((a, b) => b.relevance - a.relevance);
}

// 按時間範圍過濾逐字稿
export function filterTranscriptionsByTimeRange(transcriptions, startTime, endTime) {
  if (!transcriptions) {
    return [];
  }

  return transcriptions.filter(transcription => {
    const timestamp = transcription.timestamp;
    return (!startTime || timestamp >= startTime) &&
           (!endTime || timestamp <= endTime);
  });
}

// 按發言人過濾逐字稿
export function filterTranscriptionsBySpeaker(transcriptions, speakers) {
  if (!transcriptions || !speakers || speakers.length === 0) {
    return transcriptions || [];
  }

  const speakerSet = new Set(speakers.map(s => s.toLowerCase()));
  return transcriptions.filter(transcription =>
    speakerSet.has(transcription.speaker.toLowerCase())
  );
}

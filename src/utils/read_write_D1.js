// D1 資料庫操作工具函數

/**
 * 初始化資料庫表格
 */
export async function initializeDatabase(db) {
  try {
    // 會議表格
    await db.exec(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 逐字稿表格
    await db.exec(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        speaker TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings (id)
      )
    `);

    // 建立索引
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transcriptions_meeting_id ON transcriptions(meeting_id);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_sequence ON transcriptions(meeting_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_transcriptions_hash ON transcriptions(hash);
    `);

    console.log('Database initialized successfully');
    return { success: true };
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * 創建或更新會議
 */
export async function upsertMeeting(db, meetingData) {
  const { id, title, date, status = 'active' } = meetingData;

  try {
    const result = await db.prepare(`
      INSERT INTO meetings (id, title, date, status, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        date = excluded.date,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `).bind(id, title, date, status).run();

    return { success: true, meetingId: id, changes: result.changes };
  } catch (error) {
    console.error('Failed to upsert meeting:', error);
    throw error;
  }
}

/**
 * 獲取會議資訊
 */
export async function getMeeting(db, meetingId) {
  try {
    const meeting = await db.prepare(`
      SELECT * FROM meetings WHERE id = ?
    `).bind(meetingId).first();

    return meeting;
  } catch (error) {
    console.error('Failed to get meeting:', error);
    throw error;
  }
}

/**
 * 獲取所有會議列表
 */
export async function getAllMeetings(db, limit = 50, offset = 0) {
  try {
    const meetings = await db.prepare(`
      SELECT id, title, date, status, created_at, updated_at,
             (SELECT COUNT(*) FROM transcriptions WHERE meeting_id = meetings.id) as transcription_count
      FROM meetings
      ORDER BY date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return meetings.results || [];
  } catch (error) {
    console.error('Failed to get meetings:', error);
    throw error;
  }
}

/**
 * 插入逐字稿（避免重複）
 */
export async function insertTranscription(db, transcriptionData) {
  const { id, meeting_id, speaker, content, timestamp, sequence, hash } = transcriptionData;

  try {
    // 檢查是否已存在相同的 hash
    const existing = await db.prepare(`
      SELECT id FROM transcriptions WHERE hash = ?
    `).bind(hash).first();

    if (existing) {
      return { success: true, duplicate: true, transcriptionId: existing.id };
    }

    // 插入新的逐字稿
    const result = await db.prepare(`
      INSERT INTO transcriptions (id, meeting_id, speaker, content, timestamp, sequence, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, meeting_id, speaker, content, timestamp, sequence, hash).run();

    return {
      success: true,
      duplicate: false,
      transcriptionId: id,
      changes: result.changes
    };
  } catch (error) {
    console.error('Failed to insert transcription:', error);
    throw error;
  }
}

/**
 * 獲取會議的所有逐字稿
 */
export async function getMeetingTranscriptions(db, meetingId) {
  try {
    const transcriptions = await db.prepare(`
      SELECT * FROM transcriptions
      WHERE meeting_id = ?
      ORDER BY sequence ASC, created_at ASC
    `).bind(meetingId).all();

    return transcriptions.results || [];
  } catch (error) {
    console.error('Failed to get meeting transcriptions:', error);
    throw error;
  }
}

/**
 * 刪除會議及其所有逐字稿
 */
export async function deleteMeeting(db, meetingId) {
  try {
    // 先刪除逐字稿
    await db.prepare(`
      DELETE FROM transcriptions WHERE meeting_id = ?
    `).bind(meetingId).run();

    // 再刪除會議
    const result = await db.prepare(`
      DELETE FROM meetings WHERE id = ?
    `).bind(meetingId).run();

    return { success: true, changes: result.changes };
  } catch (error) {
    console.error('Failed to delete meeting:', error);
    throw error;
  }
}

/**
 * 獲取會議統計資訊
 */
export async function getMeetingStats(db, meetingId) {
  try {
    const stats = await db.prepare(`
      SELECT
        COUNT(*) as total_transcriptions,
        COUNT(DISTINCT speaker) as unique_speakers,
        MIN(timestamp) as start_time,
        MAX(timestamp) as end_time
      FROM transcriptions
      WHERE meeting_id = ?
    `).bind(meetingId).first();

    return stats;
  } catch (error) {
    console.error('Failed to get meeting stats:', error);
    throw error;
  }
}

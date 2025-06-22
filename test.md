## 測試命令

### 測試AI整理功能

```bash
curl -X POST \
  -F "file=@files/input_0.txt" \
  -H "Origin: http://localhost:3000" \
  http://localhost:8787/api/test-ai
```

### 測試上傳一篇逐字稿

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{
    "meeting_id": "20250622",
    "transcription": "這是測試，今天的太陽很好，時間也很充裕。我來做一點測試吧。逐字稿的摘要用英文整理也行吧。"
  }' \
  http://localhost:8787/api/upload-transcription

### 創建資料庫表格

```bash
curl -X POST \
  -H "Origin: http://localhost:3000" \
  http://localhost:8787/api/create-table
```

### 查詢整個table

```bash
http://localhost:8787/api/query-table
```
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
  -F "file=@files/transcript-2025-06-21.txt" \
  -H "Origin: http://localhost:3000" \
  http://localhost:8787/api/upload-transcription
```

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
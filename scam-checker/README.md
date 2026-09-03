# Scam Text Checker — PHP Backend

A **100% free-tier** multi-layered scam analysis pipeline built with PHP 8+.

## Architecture

```
[POST /api/analyze.php] → Raw Text
        │
        ▼
┌──────────────────────────────────┐
│  Step 1: Regex Entity Extraction │
│  → URLs, emails, phones, domains │
└──────────────────┬───────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐
│ Google   │ │ VirusT.  │ │ Gemini 1.5   │
│ Safe     │ │ Public   │ │ Flash (AI)   │
│ Browsing │ │ API v3   │ │              │
└────┬─────┘ └────┬─────┘ └──────┬───────┘
     │            │               │
     └────────────┼───────────────┘
                  ▼
┌──────────────────────────────────┐
│  Step 4: Aggregation Engine      │
│  → Weighted score + final verdict│
└──────────────────────────────────┘
                  │
                  ▼
           JSON Response
```

## Setup

### 1. Get Your Free API Keys

| Service | Free Tier Limits | Get Key |
|---------|-----------------|---------|
| Google Safe Browsing v4 | 10,000 req/day | [Google Cloud Console](https://console.cloud.google.com/apis/api/safebrowsing.googleapis.com) |
| VirusTotal Public API | 4 req/min, 500/day | [VirusTotal](https://www.virustotal.com/gui/join-us) |
| Google Gemini (1.5 Flash) | 15 RPM, 1500 RPD | [Google AI Studio](https://aistudio.google.com/app/apikey) |

### 2. Configure API Keys

Set environment variables (recommended):
```bash
export GOOGLE_SAFE_BROWSING_KEY="your_key_here"
export VIRUSTOTAL_KEY="your_key_here"
export GEMINI_API_KEY="your_key_here"
```

Or edit the placeholders directly in `api/analyze.php`.

### 3. Run the Server

```bash
cd scam-checker
php -S localhost:8080
```

### 4. Test It

```bash
curl -X POST http://localhost:8080/api/analyze.php \
  -H "Content-Type: application/json" \
  -d '{"text": "URGENT! Your bank account has been compromised. Click http://evil-bank-login.com/verify immediately or your account will be suspended. Call +1-800-555-0199 for assistance."}'
```

## API Reference

### `POST /api/analyze.php`

**Request Body:**
```json
{
  "text": "The message text to analyze for scam patterns"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "is_scam": true,
    "confidence_score": 92,
    "severity": "CRITICAL",
    "detected_entities": {
      "urls": ["http://evil-bank-login.com/verify"],
      "emails": [],
      "phones": ["+1-800-555-0199"],
      "domains": []
    },
    "threat_intel_flags": [...],
    "ai_analysis": {
      "threat_score": 95,
      "verdict": "CRITICAL",
      "reasoning": "This message exhibits classic phishing patterns...",
      "indicators": [...]
    },
    "pipeline_metadata": {
      "execution_time_ms": 1432.5,
      "urls_checked": 1,
      "engines_used": { ... }
    }
  }
}
```

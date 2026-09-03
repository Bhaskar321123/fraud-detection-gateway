<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Scam Text Checker — Multi-Layered Analysis Pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  A 100% free-tier backend that executes a 4-step threat analysis pipeline:
 *
 *    Step 1: Regex Extraction   → URLs, emails, phone numbers, domains
 *    Step 2: Threat Intel Lookup → Google Safe Browsing + VirusTotal
 *    Step 3: AI Behavioral      → Google Gemini 1.5 Flash (linguistic analysis)
 *    Step 4: Aggregation         → Unified confidence score + final verdict
 *
 *  Tech Stack:   PHP 8+, cURL, preg_match_all
 *  Free APIs:    Google Safe Browsing v4, VirusTotal Public, Gemini 1.5 Flash
 *
 *  @author  Scam Checker Pipeline
 *  @version 1.0.0
 */

// ─── CONFIGURATION ──────────────────────────────────────────────────────────

// API Keys — replace with your own free-tier keys
$googleSafeBrowsingKey = getenv('GOOGLE_SAFE_BROWSING_KEY') ?: '';
$virusTotalKey         = getenv('VIRUSTOTAL_KEY')           ?: '';
$geminiApiKey          = getenv('GEMINI_API_KEY')            ?: '';

// Increase PHP execution time (default is 30s) because multiple APIs can easily take > 30s combined
set_time_limit(120);

// Thresholds
define('GEMINI_THREAT_THRESHOLD', 75);   // AI score >= 75 → flag as scam
define('CURL_TIMEOUT_SECONDS', 30);       // Max wait per API call
define('VT_RATE_LIMIT_DELAY_MS', 16000);  // 16s between VirusTotal calls (4 req/min)

// ─── CORS & HEADERS ────────────────────────────────────────────────────────

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── REQUEST VALIDATION ────────────────────────────────────────────────────

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, ['error' => 'Method not allowed. Use POST.']);
}

$input = json_decode(file_get_contents('php://input'), true);
$rawText = trim($input['text'] ?? '');

if (empty($rawText)) {
    jsonResponse(400, ['error' => 'Missing required field: "text"']);
}

if (strlen($rawText) > 10000) {
    jsonResponse(400, ['error' => 'Text payload exceeds 10,000 character limit.']);
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 1: INGESTION & ENTITY EXTRACTION (Regex)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract all identifiable entities (URLs, emails, phones, domains) from text.
 *
 * Uses robust regex patterns to catch:
 *  - Full URLs with http(s) or bare www.
 *  - Email addresses (RFC-compliant subset)
 *  - International phone numbers (+1, +44, +91, etc.)
 *  - Bare domain names (e.g., example.com)
 *
 * @param  string $text  Raw input text
 * @return array  Associative array of extracted entity arrays
 */
function extractEntities(string $text): array {
    $entities = [
        'urls'    => [],
        'emails'  => [],
        'phones'  => [],
        'domains' => [],
    ];

    // ── URLs: http(s)://... or www.domain.tld/path
    $urlPattern = '/\b(?:https?:\/\/|www\.)[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{2,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/i';
    if (preg_match_all($urlPattern, $text, $matches)) {
        $entities['urls'] = array_unique($matches[0]);
    }

    // ── Email addresses
    $emailPattern = '/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/';
    if (preg_match_all($emailPattern, $text, $matches)) {
        $entities['emails'] = array_unique($matches[0]);
    }

    // ── Phone numbers: +CC followed by 7-15 digits (with optional separators)
    $phonePattern = '/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/';
    if (preg_match_all($phonePattern, $text, $matches)) {
        // Filter out numbers that are too short to be phones (< 7 digits)
        $entities['phones'] = array_values(array_unique(array_filter($matches[0], function ($phone) {
            return strlen(preg_replace('/\D/', '', $phone)) >= 7;
        })));
    }

    // ── Bare domains (e.g., "evil-site.com" without http)
    $domainPattern = '/\b(?!www\.)([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}\b/';
    if (preg_match_all($domainPattern, $text, $matches)) {
        // Exclude anything already captured as a URL or email domain
        $existingDomains = array_map(function ($url) {
            return parse_url($url, PHP_URL_HOST) ?? '';
        }, $entities['urls']);

        $emailDomains = array_map(function ($email) {
            $parts = explode('@', $email);
            return $parts[1] ?? '';
        }, $entities['emails']);

        $excludeSet = array_merge($existingDomains, $emailDomains);

        $entities['domains'] = array_values(array_unique(array_filter($matches[0], function ($domain) use ($excludeSet) {
            return !in_array($domain, $excludeSet);
        })));
    }

    return $entities;
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 2: THREAT INTELLIGENCE CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Query Google Safe Browsing API v4 for a batch of URLs.
 *
 * Google Safe Browsing Lookup API (v4) allows up to 500 URLs per request.
 * Free tier: 10,000 requests/day.
 *
 * @param  array  $urls     Array of URL strings to check
 * @param  string $apiKey   Google Safe Browsing API key
 * @return array  Array of flagged URLs with threat type details
 */
function checkGoogleSafeBrowsing(array $urls, string $apiKey): array {
    if (empty($urls) || str_starts_with($apiKey, 'YOUR_')) {
        return [];
    }

    $endpoint = "https://safebrowsing.googleapis.com/v4/threatMatches:find?key={$apiKey}";

    // Build the threat entries from URLs
    $threatEntries = array_map(fn($url) => ['url' => $url], $urls);

    $requestBody = [
        'client' => [
            'clientId'      => 'scam-text-checker',
            'clientVersion' => '1.0.0',
        ],
        'threatInfo' => [
            'threatTypes'      => ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
            'platformTypes'    => ['ANY_PLATFORM'],
            'threatEntryTypes' => ['URL'],
            'threatEntries'    => $threatEntries,
        ],
    ];

    $response = curlPostJson($endpoint, $requestBody);

    if ($response === null || isset($response['error'])) {
        return [['source' => 'google_safe_browsing', 'error' => $response['error']['message'] ?? 'API request failed']];
    }

    $flags = [];
    if (!empty($response['matches'])) {
        foreach ($response['matches'] as $match) {
            $flags[] = [
                'source'      => 'google_safe_browsing',
                'url'         => $match['threat']['url'] ?? 'unknown',
                'threat_type' => $match['threatType'] ?? 'UNKNOWN',
                'platform'    => $match['platformType'] ?? 'UNKNOWN',
            ];
        }
    }

    return $flags;
}

/**
 * Query VirusTotal Public API v3 for a single URL.
 *
 * Free tier limits: 4 requests/minute, 500 requests/day, 15.5K/month.
 * We check URLs one at a time to respect the rate limit.
 *
 * @param  string $url     The URL to analyze
 * @param  string $apiKey  VirusTotal API key
 * @return array|null  Threat flag array or null if clean/error
 */
function checkVirusTotal(string $url, string $apiKey): ?array {
    if (str_starts_with($apiKey, 'YOUR_')) {
        return null;
    }

    // VirusTotal URL scan uses base64-encoded URL (no padding) as the ID
    $urlId = rtrim(base64_encode($url), '=');
    $endpoint = "https://www.virustotal.com/api/v3/urls/{$urlId}";

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $endpoint,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => CURL_TIMEOUT_SECONDS,
        CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER     => [
            "x-apikey: {$apiKey}",
            "Accept: application/json",
        ],
    ]);

    $responseRaw = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    // curl_close() removed — deprecated since PHP 8.5, no-op since 8.0

    // Handle rate limiting (HTTP 429)
    if ($httpCode === 429) {
        return ['source' => 'virustotal', 'url' => $url, 'error' => 'Rate limit exceeded (4 req/min). Try again later.'];
    }

    // Handle not-found (URL never scanned before)
    if ($httpCode === 404) {
        // Submit URL for scanning instead
        return checkVirusTotalSubmit($url, $apiKey);
    }

    if ($httpCode !== 200 || empty($responseRaw)) {
        return ['source' => 'virustotal', 'url' => $url, 'error' => $curlError ?: "HTTP {$httpCode}"];
    }

    $data = json_decode($responseRaw, true);
    $stats = $data['data']['attributes']['last_analysis_stats'] ?? [];

    $malicious  = $stats['malicious'] ?? 0;
    $suspicious = $stats['suspicious'] ?? 0;
    $harmless   = $stats['harmless'] ?? 0;
    $undetected = $stats['undetected'] ?? 0;
    $total      = $malicious + $suspicious + $harmless + $undetected;

    // Flag if any engine detected it as malicious or suspicious
    if ($malicious > 0 || $suspicious > 0) {
        return [
            'source'      => 'virustotal',
            'url'         => $url,
            'threat_type' => $malicious > 0 ? 'MALICIOUS' : 'SUSPICIOUS',
            'detections'  => "{$malicious} malicious, {$suspicious} suspicious out of {$total} engines",
            'score'       => $total > 0 ? round(($malicious + $suspicious) / $total * 100) : 0,
        ];
    }

    return null; // Clean
}

/**
 * Submit a URL to VirusTotal for first-time scanning.
 * Returns partial result indicating the scan was submitted.
 */
function checkVirusTotalSubmit(string $url, string $apiKey): ?array {
    $endpoint = "https://www.virustotal.com/api/v3/urls";

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $endpoint,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => CURL_TIMEOUT_SECONDS,
        CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query(['url' => $url]),
        CURLOPT_HTTPHEADER     => [
            "x-apikey: {$apiKey}",
            "Accept: application/json",
            "Content-Type: application/x-www-form-urlencoded",
        ],
    ]);

    $responseRaw = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    // curl_close() removed — deprecated since PHP 8.5, no-op since 8.0

    if ($httpCode === 200 || $httpCode === 201) {
        return [
            'source'  => 'virustotal',
            'url'     => $url,
            'status'  => 'SUBMITTED_FOR_SCAN',
            'message' => 'URL was not previously scanned. It has been submitted for analysis.',
        ];
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 3: AI BEHAVIORAL ANALYSIS (Google Gemini 1.5 Flash)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send the raw text to Google Gemini for AI-powered scam analysis.
 *
 * Uses Gemini 1.5 Flash (free tier: 15 RPM, 1M TPM, 1500 RPD).
 * The system prompt instructs Gemini to act as a cybersecurity analyst
 * and return structured JSON with a threat score and reasoning.
 *
 * @param  string $text    The raw message text to analyze
 * @param  string $apiKey  Gemini API key
 * @return array  AI analysis result with threat_score and reasoning
 */
function analyzeWithGemini(string $text, string $apiKey): array {
    if (str_starts_with($apiKey, 'YOUR_')) {
        return [
            'threat_score' => 0,
            'reasoning'    => 'Gemini API key not configured. Skipping AI analysis.',
            'indicators'   => [],
        ];
    }

    $endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}";

    $systemPrompt = <<<PROMPT
You are an expert cybersecurity analyst specializing in social engineering, phishing, smishing, and scam detection. 

Analyze the following text message for scam indicators. Evaluate it across these dimensions:

1. **Artificial Urgency**: Does it pressure immediate action with threats (account suspension, legal action, expiry)?
2. **Spoofed Authority**: Does it impersonate banks, government agencies, tech companies, or delivery services?
3. **Financial Bait**: Does it promise money, prizes, refunds, or request payment/financial details?
4. **Suspicious Links/Contacts**: Does it direct the user to click links, call numbers, or reply with personal info?
5. **Grammatical Anomalies**: Does it have unusual grammar, spelling errors, or formatting typical of scam messages?
6. **Social Engineering Tactics**: Does it exploit fear, curiosity, greed, or helpfulness?

You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text). Use this exact structure:

{
  "threat_score": <integer 0-100>,
  "verdict": "<SAFE|LOW_RISK|MODERATE_RISK|HIGH_RISK|CRITICAL>",
  "reasoning": "<2-3 sentence explanation of your assessment. DO NOT USE ANY DOUBLE QUOTES INSIDE THIS STRING. Use single quotes instead if needed.>",
  "indicators": [
    {"type": "<urgency|authority_spoofing|financial_bait|suspicious_link|grammar|social_engineering>", "detail": "<specific evidence from the text. DO NOT USE DOUBLE QUOTES HERE EITHER.>"}
  ]
}

Scoring guide:
- 0-20: Legitimate message, no scam indicators
- 21-40: Minor suspicious elements but likely benign
- 41-60: Moderate risk, contains some scam patterns
- 61-80: High risk, multiple strong scam indicators
- 81-100: Critical threat, definitive scam characteristics
PROMPT;

    $requestBody = [
        'contents' => [
            [
                'role'  => 'user',
                'parts' => [
                    ['text' => "Analyze this message for scam indicators:\n\n---\n{$text}\n---"],
                ],
            ],
        ],
        'systemInstruction' => [
            'parts' => [
                ['text' => $systemPrompt],
            ],
        ],
        'generationConfig' => [
            'temperature'     => 0.1,  // Low temperature for consistent, analytical output
            'topP'            => 0.8,
            'maxOutputTokens' => 1024,
            'responseMimeType' => 'application/json',  // Force JSON output
        ],
        'safetySettings' => [
            ['category' => 'HARM_CATEGORY_HARASSMENT', 'threshold' => 'BLOCK_NONE'],
            ['category' => 'HARM_CATEGORY_HATE_SPEECH', 'threshold' => 'BLOCK_NONE'],
            ['category' => 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'threshold' => 'BLOCK_NONE'],
            ['category' => 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold' => 'BLOCK_NONE']
        ],
    ];

    $response = curlPostJson($endpoint, $requestBody);

    if ($response === null) {
        return [
            'threat_score' => 0,
            'reasoning'    => 'Gemini API request failed or timed out.',
            'indicators'   => [],
        ];
    }

    if (isset($response['error'])) {
        return [
            'threat_score' => 0,
            'reasoning'    => 'Gemini API Error: ' . ($response['error']['message'] ?? json_encode($response['error'])),
            'indicators'   => [],
        ];
    }

    // Extract the text content from Gemini's response structure
    $generatedText = $response['candidates'][0]['content']['parts'][0]['text'] ?? '';

    if (empty($generatedText)) {
        return [
            'threat_score' => 0,
            'reasoning'    => 'Gemini returned an empty response.',
            'indicators'   => [],
        ];
    }

    // Parse the JSON from Gemini's response
    // Nuclear JSON Sanitization:
    // Extract everything between { and } to guarantee we only parse the JSON object
    $startPos = strpos($generatedText, '{');
    $endPos = strrpos($generatedText, '}');
    
    if ($startPos !== false && $endPos !== false && $endPos > $startPos) {
        $cleanJson = substr($generatedText, $startPos, $endPos - $startPos + 1);
    } else {
        $cleanJson = $generatedText;
    }

    // Replace actual newlines/tabs with spaces
    $cleanJson = str_replace(["\n", "\r", "\t"], " ", $cleanJson);
    // Strip control characters
    $cleanJson = preg_replace('/[\x00-\x1F\x7F]/', '', $cleanJson);

    $parsed = json_decode($cleanJson, true);

    // Auto-fix common Gemini truncation (missing closing array and object brackets)
    if ($parsed === null) {
        $parsed = json_decode($cleanJson . ']}', true);
    }
    // Auto-fix if it was cut off inside a string
    if ($parsed === null) {
        $parsed = json_decode($cleanJson . '"]}', true);
    }
    // Auto-fix if it was cut off right after a quote
    if ($parsed === null) {
        $parsed = json_decode($cleanJson . '}]}', true);
    }

    if ($parsed === null) {
        $jsonError = json_last_error_msg();
        error_log("Gemini JSON Parse Error: {$jsonError}. Raw response: {$cleanJson}");
        error_log("Full Google API Response: " . print_r($response, true));
        return [
            'threat_score' => 0,
            'reasoning'    => "Gemini returned invalid JSON ({$jsonError}). Check server logs for full response.",
            'indicators'   => [],
        ];
    }

    return [
        'threat_score' => (int) ($parsed['threat_score'] ?? 0),
        'verdict'      => $parsed['verdict'] ?? 'UNKNOWN',
        'reasoning'    => $parsed['reasoning'] ?? 'No reasoning provided.',
        'indicators'   => $parsed['indicators'] ?? [],
    ];
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 4: AGGREGATION & FINAL SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate all analysis results into a unified verdict.
 *
 * Scoring algorithm:
 *  - If ANY URL is flagged by Google Safe Browsing → automatic scam flag
 *  - If ANY URL is flagged by VirusTotal (malicious) → automatic scam flag
 *  - If Gemini threat_score >= GEMINI_THREAT_THRESHOLD → scam flag
 *  - Final confidence = weighted combination:
 *      40% AI score + 30% Safe Browsing signal + 30% VirusTotal signal
 *
 * @param  array $entities     Extracted entities from Step 1
 * @param  array $threatFlags  Flags from Step 2 (Safe Browsing + VirusTotal)
 * @param  array $aiAnalysis   Result from Step 3 (Gemini)
 * @return array Final unified response
 */
function aggregateResults(array $entities, array $threatFlags, array $aiAnalysis): array {
    $aiScore = $aiAnalysis['threat_score'] ?? 0;

    // Separate real threat flags from errors/submissions
    $realThreats = array_filter($threatFlags, fn($flag) =>
        !isset($flag['error']) && !isset($flag['status'])
    );

    $hasStaticThreat = count($realThreats) > 0;
    $hasAiThreat     = $aiScore >= GEMINI_THREAT_THRESHOLD;

    // ── Weighted confidence score calculation ────────────────────────
    $staticSignal = $hasStaticThreat ? 100 : 0;
    $confidenceScore = (int) round(
        ($aiScore * 0.4) +          // 40% weight to AI analysis
        ($staticSignal * 0.3) +     // 30% weight to Safe Browsing
        ($staticSignal * 0.3)       // 30% weight to VirusTotal
    );

    // Clamp to 0-100
    $confidenceScore = max(0, min(100, $confidenceScore));

    // If static threat intel flagged something, floor the confidence at 80
    if ($hasStaticThreat && $confidenceScore < 80) {
        $confidenceScore = 80;
    }

    // ── Final verdict ────────────────────────────────────────────────
    $isScam = $hasStaticThreat || $hasAiThreat || $confidenceScore >= GEMINI_THREAT_THRESHOLD;

    // Determine severity label
    if ($confidenceScore >= 80)      $severity = 'CRITICAL';
    elseif ($confidenceScore >= 60)  $severity = 'HIGH';
    elseif ($confidenceScore >= 40)  $severity = 'MODERATE';
    elseif ($confidenceScore >= 20)  $severity = 'LOW';
    else                              $severity = 'SAFE';

    return [
        'is_scam'           => $isScam,
        'confidence_score'  => $confidenceScore,
        'severity'          => $severity,
        'detected_entities' => $entities,
        'threat_intel_flags' => $threatFlags,
        'ai_analysis'       => [
            'threat_score' => $aiScore,
            'verdict'      => $aiAnalysis['verdict'] ?? 'UNKNOWN',
            'reasoning'    => $aiAnalysis['reasoning'] ?? '',
            'indicators'   => $aiAnalysis['indicators'] ?? [],
        ],
        'analysis_timestamp' => gmdate('c'),
    ];
}

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Perform a cURL POST request with a JSON body.
 *
 * @param  string $url   API endpoint
 * @param  array  $body  Request body (will be JSON-encoded)
 * @return array|null  Decoded JSON response or null on failure
 */
function curlPostJson(string $url, array $body): ?array {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => CURL_TIMEOUT_SECONDS,
        CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($body),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Accept: application/json',
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    // curl_close() removed — deprecated since PHP 8.5, no-op since 8.0

    if ($curlError) {
        error_log("cURL Error [{$httpCode}] for {$url}: {$curlError}");
        return null;
    }

    if ($httpCode >= 400) {
        error_log("HTTP Error [{$httpCode}] for {$url}: {$response}");
        // Return the error body so callers can see the actual API error
        $decoded = json_decode($response, true);
        return $decoded; // May contain error details from the API
    }

    return json_decode($response, true);
}

/**
 * Send a JSON HTTP response and terminate.
 *
 * @param int   $statusCode  HTTP status code
 * @param array $data        Response payload
 */
function jsonResponse(int $statusCode, array $data): never {
    http_response_code($statusCode);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PIPELINE EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

$startTime = microtime(true);

// ── Step 1: Extract entities ─────────────────────────────────────────────
$entities = extractEntities($rawText);

// Normalize URLs: prepend https:// to bare domains for API lookups
$urlsToCheck = $entities['urls'];
foreach ($entities['domains'] as $domain) {
    $urlsToCheck[] = "https://{$domain}";
}
$urlsToCheck = array_unique($urlsToCheck);

// ── Step 2: Threat Intelligence Lookups ──────────────────────────────────
$threatFlags = [];

// 2a. Google Safe Browsing (batch — all URLs in one request)
$safeBrowsingFlags = checkGoogleSafeBrowsing($urlsToCheck, $googleSafeBrowsingKey);
$threatFlags = array_merge($threatFlags, $safeBrowsingFlags);

// 2b. VirusTotal (sequential, respecting 4 req/min rate limit)
$vtChecked = 0;
foreach ($urlsToCheck as $urlToCheck) {
    if ($vtChecked >= 4) {
        // Hard stop at 4 URLs to respect free-tier rate limit
        $threatFlags[] = [
            'source'  => 'virustotal',
            'warning' => 'Rate limit reached. Only first 4 URLs checked.',
        ];
        break;
    }

    $vtResult = checkVirusTotal($urlToCheck, $virusTotalKey);
    if ($vtResult !== null) {
        $threatFlags[] = $vtResult;
    }
    $vtChecked++;

    // Rate limit delay between requests (skip after last one)
    if ($vtChecked < count($urlsToCheck) && $vtChecked < 4) {
        usleep(VT_RATE_LIMIT_DELAY_MS * 1000); // Convert ms to microseconds
    }
}

// ── Step 3: AI Behavioral Analysis ───────────────────────────────────────
$aiAnalysis = analyzeWithGemini($rawText, $geminiApiKey);

// ── Step 4: Aggregation & Final Verdict ──────────────────────────────────
$result = aggregateResults($entities, $threatFlags, $aiAnalysis);

// Add pipeline metadata
$result['pipeline_metadata'] = [
    'execution_time_ms' => round((microtime(true) - $startTime) * 1000, 2),
    'urls_checked'      => count($urlsToCheck),
    'engines_used'      => [
        'regex_extraction'     => true,
        'google_safe_browsing' => !str_starts_with($googleSafeBrowsingKey, 'YOUR_'),
        'virustotal'           => !str_starts_with($virusTotalKey, 'YOUR_'),
        'gemini_ai'            => !str_starts_with($geminiApiKey, 'YOUR_'),
    ],
];

jsonResponse(200, [
    'success' => true,
    'data'    => $result,
]);

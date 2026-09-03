<?php
$generatedText = <<<JSON
{
  "threat_score": 95,
  "verdict": "CRITICAL",
  "reasoning": "This message exhibits multiple critical scam indicators...",
  "indicators": [
    {
      "type": "urgency",
      "detail": "URGENT! Your bank account is locked. Click ... to verify now!"
    }
  ]
}
JSON;

$cleanJson = preg_replace('/^```(?:json)?\s*|\s*```$/m', '', trim($generatedText));
$cleanJson = str_replace(["\n", "\r", "\t"], " ", $cleanJson);

$parsed = json_decode($cleanJson, true);
if ($parsed === null) {
    echo "ERROR: " . json_last_error_msg() . "\n";
} else {
    echo "SUCCESS!\n";
}
